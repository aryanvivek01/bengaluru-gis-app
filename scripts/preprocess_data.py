#!/usr/bin/env python3
"""
scripts/preprocess_data.py

Final version:
- Reads raw ward, school, tree, DEM datasets
- Uses proper ward names (KGISWardName)
- Uses TreeName as tree_type
- Exports processed GeoJSON + CSV for frontend
"""

import os
from pathlib import Path
import json
import warnings

import geopandas as gpd
import pandas as pd
import rasterio
from rasterio.mask import mask
from shapely.geometry import Point, mapping
import numpy as np
from tqdm import tqdm

# -------------------------
# PATHS
# -------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
OUT_DIR = PROJECT_ROOT / "data" / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

WARDS_RAW = RAW_DIR / "BBMP.geojson"
SCHOOLS_RAW = RAW_DIR / "schools_osm.geojson"
DEM_RAW = RAW_DIR / "dem_merged.tif"
TREE_FILES = [
    RAW_DIR / "blr_east_zone_trees_11_2024.kml",
    RAW_DIR / "blr_south_zone_trees_11_2024.kml",
    RAW_DIR / "blr_west_zone_trees_11_2024.kml",
]

SIMPLIFY_TOLERANCE = 0.0001  # ~11m

# -------------------------
# 1) Wards
# -------------------------
print("1) Loading ward boundaries...")
wards = gpd.read_file(WARDS_RAW)
print(f"  -> Wards: {len(wards)} features")

wards = wards.to_crs(epsg=4326)

# Use correct fields
if "KGISWardNo" in wards.columns:
    wards["ward_id"] = wards["KGISWardNo"].astype(int)
else:
    wards["ward_id"] = wards.index + 1

if "KGISWardName" in wards.columns:
    wards["ward_name"] = wards["KGISWardName"]
else:
    wards["ward_name"] = "Ward " + wards["ward_id"].astype(str)

# -------------------------
# 2) Trees
# -------------------------
print("\n2) Loading and merging tree census files...")
tree_layers = []
for tf in TREE_FILES:
    if tf.exists():
        try:
            gdf = gpd.read_file(tf)
            gdf = gdf.to_crs(epsg=4326)

            # Normalize tree_type
            if "TreeName" in gdf.columns:
                gdf["tree_type"] = gdf["TreeName"].astype(str).str.strip()
            elif "tree_type" in gdf.columns:
                gdf["tree_type"] = gdf["tree_type"].astype(str).str.strip()
            else:
                gdf["tree_type"] = "unknown"

            tree_layers.append(gdf)
        except Exception as e:
            print(f"  !! Error reading {tf}: {e}")

if not tree_layers:
    raise FileNotFoundError("No valid tree files found")

trees = pd.concat(tree_layers, ignore_index=True)
trees = gpd.GeoDataFrame(trees, geometry="geometry", crs="EPSG:4326")
print(f"  -> Trees: {len(trees)} features")

# -------------------------
# 3) Schools
# -------------------------
print("\n3) Loading schools...")
schools = gpd.read_file(SCHOOLS_RAW)
schools = schools.to_crs(epsg=4326)
schools = schools[schools.geometry.type.isin(["Point", "MultiPoint"])].copy()
print(f"  -> Schools: {len(schools)} features")

# -------------------------
# 4) Clip DEM
# -------------------------
print("\n4) Clipping DEM...")
with rasterio.open(DEM_RAW) as src:
    wards_dem = wards.to_crs(src.crs)

    # Clean invalid geometries
    wards_dem["geometry"] = wards_dem.buffer(0)

    # Use robust union_all instead of unary_union
    from shapely.ops import unary_union
    geom = [mapping(unary_union(wards_dem.geometry))]

    out_image, out_transform = mask(src, geom, crop=True, nodata=src.nodata)
    out_meta = src.meta.copy()
    out_meta.update({
        "height": out_image.shape[1],
        "width": out_image.shape[2],
        "transform": out_transform
    })

dem_out = OUT_DIR / "dem_clipped.tif"
with rasterio.open(dem_out, "w", **out_meta) as dest:
    dest.write(out_image)
print(f"  -> DEM clipped: {dem_out}")

# -------------------------
# 5) Avg Elevation per Ward
# -------------------------
print("\n5) Calculating avg elevation per ward...")
avg_elevs = {}
with rasterio.open(dem_out) as src:
    nodata = src.nodata
    wards_dem = wards.to_crs(src.crs)
    for _, row in tqdm(wards_dem.iterrows(), total=len(wards_dem)):
        geom = [mapping(row.geometry)]
        try:
            out, _ = mask(src, geom, crop=True, nodata=nodata)
            band = out[0].astype("float64")
            if nodata is not None:
                band[band == nodata] = np.nan
            mean_val = float(np.nanmean(band))
            avg_elevs[row["ward_id"]] = None if np.isnan(mean_val) else mean_val
        except:
            avg_elevs[row["ward_id"]] = None

# -------------------------
# 6) Spatial Joins
# -------------------------
print("\n6) Spatial joins...")
trees_with_ward = gpd.sjoin(trees, wards[["ward_id","ward_name","geometry"]], how="left", predicate="within")
schools_with_ward = gpd.sjoin(schools, wards[["ward_id","ward_name","geometry"]], how="left", predicate="within")

# -------------------------
# 7) Aggregations
# -------------------------
print("\n7) Aggregating...")

# Tree counts
tree_counts = (
    trees_with_ward.dropna(subset=["ward_id"])
    .groupby(["ward_id","tree_type"])
    .size()
    .reset_index(name="count")
)
ward_tree_dict = {wid: dict(zip(g["tree_type"], g["count"])) for wid, g in tree_counts.groupby("ward_id")}

# School counts
school_counts = (
    schools_with_ward.dropna(subset=["ward_id"])
    .groupby("ward_id")
    .size()
    .reset_index(name="school_count")
)
school_count_dict = dict(zip(school_counts["ward_id"], school_counts["school_count"]))

# -------------------------
# 8) Attach stats + Export
# -------------------------
print("\n8) Saving outputs...")

wards["num_schools"] = wards["ward_id"].map(school_count_dict).fillna(0).astype(int)
wards["avg_elev"] = wards["ward_id"].map(avg_elevs)
wards["tree_dist"] = wards["ward_id"].apply(lambda wid: json.dumps(ward_tree_dict.get(wid, {})))

# Simplify
wards_simpl = wards.copy()
wards_simpl["geometry"] = wards_simpl.geometry.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)

# Write
wards_simpl.to_file(OUT_DIR / "wards.geojson", driver="GeoJSON")
trees.to_file(OUT_DIR / "trees.geojson", driver="GeoJSON")
schools.to_file(OUT_DIR / "schools.geojson", driver="GeoJSON")

wards_simpl[["ward_id","ward_name","num_schools","avg_elev"]].to_csv(OUT_DIR / "ward_stats.csv", index=False)
tree_counts.to_csv(OUT_DIR / "ward_tree_counts.csv", index=False)

print("\n Preprocessing complete! Outputs in:", OUT_DIR)
