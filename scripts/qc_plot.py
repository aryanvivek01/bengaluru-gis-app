import geopandas as gpd
import matplotlib.pyplot as plt

wards = gpd.read_file("data/processed/wards.geojson")
schools = gpd.read_file("data/processed/schools.geojson")
trees = gpd.read_file("data/processed/trees.geojson")

fig, ax = plt.subplots(figsize=(10, 10))

wards.plot(ax=ax, facecolor="none", edgecolor="black", linewidth=0.5)
schools.plot(ax=ax, color="red", markersize=5, label="Schools")
trees.sample(2000, random_state=1).plot(ax=ax, color="green", markersize=1, alpha=0.5, label="Trees (sample)")

plt.legend()
plt.title("QC Plot: Wards, Schools, Trees (sampled)")
plt.show()
