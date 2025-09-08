// app/static/app.js

// Map init
const map = L.map("map").setView([12.97, 77.59], 12);

// Add OSM basemap
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  zIndex: 0
}).addTo(map);

// Global containers
let wardStats = {};     
let treeCounts = {};    
let treeChart = null;

// Layer references
let wardLayer = null;
let schoolLayer = null;
let treeCluster = null;
let treeHeat = null;
let demColorLayer = null;
let demHillshadeLayer = null;

// ---------- simple safe wkey ----------
function wkey(id) {
  if (id === undefined || id === null || id === "") return "";
  return String(id).trim();
}

// ---------- try multiple normalization variants for an input value ----------
function tryVariants(val){
  if (val === undefined || val === null) return [];
  const s = String(val).trim();
  const set = new Set();
  if (s !== "") set.add(s);                // as-is
  // numeric parse
  const num = Number(s);
  if (!Number.isNaN(num) && isFinite(num)) set.add(String(parseInt(num)));
  // remove leading zeros
  set.add(s.replace(/^0+/, '') || s);
  // digits-only
  const digits = s.replace(/\D+/g, '');
  if (digits) set.add(String(parseInt(digits)));
  // uppercase
  set.add(s.toUpperCase());
  return Array.from(set).filter(Boolean);
}

// ---------- find a ward id in props that matches wardStats/treeCounts keys ----------
function matchWardId(props){
  if (!props) return null;
  const wardKeys = new Set(Object.keys(wardStats).map(k => String(k).trim()));
  const treeKeys = new Set(Object.keys(treeCounts).map(k => String(k).trim()));

  // Try all property values and their variants
  for (const pkey of Object.keys(props)) {
    const val = props[pkey];
    const variants = tryVariants(val);
    for (const v of variants) {
      if (wardKeys.has(v) || treeKeys.has(v)) return v;
    }
  }

  // As a last attempt, try parsing any property as integer and matching that
  for (const pkey of Object.keys(props)) {
    const val = props[pkey];
    const variants = tryVariants(val);
    for (const v of variants) {
      const asInt = String(parseInt(v));
      if (!Number.isNaN(parseInt(v)) && (wardKeys.has(asInt) || treeKeys.has(asInt))) return asInt;
    }
  }

  return null;
}

// Load CSV APIs first
Promise.all([
  fetch("/api/ward_stats").then(r => r.json()),
  fetch("/api/ward_tree_counts").then(r => r.json())
]).then(([statsArr, treeArr]) => {
  statsArr.forEach(r => wardStats[wkey(r.ward_id)] = r);
  treeArr.forEach(r => {
    const id = wkey(r.ward_id);
    if (!treeCounts[id]) treeCounts[id] = {};
    treeCounts[id][r.tree_type] = Number(r.count);
  });

  // Load layers
  loadWards();
  loadSchools();
  loadTrees();
  loadDemColorTiles();
  loadDemHillshadeTiles();

  // Default ward info
  setTimeout(() => {
    const defaultWardId = "53";
    const defaultWardName = wardStats[defaultWardId] ? wardStats[defaultWardId].ward_name : `Ward ${defaultWardId}`;
    if (Object.keys(wardStats).length > 0) {
      showWardInfo(defaultWardId, defaultWardName);
    }
  }, 1500);
}).catch(err => {
  console.error("Error loading APIs:", err);
  loadWards();
  loadSchools();
  loadTrees();
  loadDemColorTiles();
  loadDemHillshadeTiles();
});

// Wards
function loadWards(){
  fetch("/data/processed/wards.geojson").then(r=>r.json()).then(data=>{
    // Attach matched ward key for each feature before creating the layer
    let matched = 0, unmatched = 0;
    data.features.forEach(f => {
      const props = f.properties || {};
      const matchedKey = matchWardId(props);
      if (matchedKey) { matched++; props.__wardKey = matchedKey; }
      else { unmatched++; props.__wardKey = null; }
    });

    console.log("WardStats keys:", Object.keys(wardStats));
    console.log("TreeCounts keys:", Object.keys(treeCounts));
    console.log(`Wards loaded: ${data.features.length} — matched: ${matched}, unmatched: ${unmatched}`);

    if (unmatched > 0) {
      const samples = data.features.filter(f => !f.properties.__wardKey).slice(0,10);
      console.log("Sample unmatched ward properties (first 10):", samples.map(f => f.properties));
    }

    wardLayer = L.geoJSON(data, {
      style: { color: "black", weight: 1, fillColor: "#ffeb66", fillOpacity: 0.25 },
      onEachFeature: (feat, layer) => {
        layer.on("click", () => {
          const props = feat.properties || {};
          const id = props.__wardKey || wkey(props.ward_id || props.KGISWardNo || props.KGISWardID || props.WARD_NO || props.id);
          const name = props.ward_name || props.KGISWardName || props.name || ("Ward " + id);
          console.log("Clicked ward, using id:", id, " (props.__wardKey:", props.__wardKey, ")");
          showWardInfo(id, name, feat.properties);
        });
      }
    }).addTo(map);

    ensureLayerControl().addOverlay(wardLayer, "Ward Boundaries");
  }).catch(e=>console.error("Failed to load wards.geojson:", e));
}

// Schools
function loadSchools(){
  fetch("/data/processed/schools.geojson").then(r=>r.json()).then(data=>{
    schoolLayer = L.geoJSON(data, {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, {
        radius: 5, color: "red", fillColor: "red", fillOpacity: 0.9
      })
    }).addTo(map);

    ensureLayerControl().addOverlay(schoolLayer, "Schools");
  }).catch(e=>console.error("Failed to load schools.geojson:", e));
}

// Trees
function loadTrees(){
  fetch("/data/processed/trees.geojson").then(r=>r.json()).then(data=>{
    treeCluster = L.markerClusterGroup({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      maxClusterRadius: 40
    });

    data.features.forEach(f => {
      const coords = f.geometry && f.geometry.coordinates;
      if (!coords) return;
      const latlng = L.latLng(coords[1], coords[0]);
      const marker = L.circleMarker(latlng, {
        radius: 3,
        color: "green",
        fillColor: "green",
        fillOpacity: 0.6
      });
      treeCluster.addLayer(marker);
    });

    treeCluster.addTo(map);
    ensureLayerControl().addOverlay(treeCluster, "Trees (cluster)");

    const heatPts = data.features.map(f => {
      const c = f.geometry && f.geometry.coordinates;
      if (!c) return null;
      return [c[1], c[0], 0.5];
    }).filter(Boolean);

    treeHeat = L.heatLayer(heatPts, { radius: 18, blur: 25, maxZoom: 17 });
    ensureLayerControl().addOverlay(treeHeat, "Tree Heatmap");
  }).catch(e=>console.error("Failed to load trees.geojson:", e));
}

// DEM Color
function loadDemColorTiles() {
  demColorLayer = L.tileLayer("/data/processed/dem_tiles_color/{z}/{x}/{y}.png", {
    attribution: "DEM Color",
    maxZoom: 16,
    minZoom: 10,
    tms: true,
    opacity: 0.7,
    zIndex: 1
  }).addTo(map);

  ensureLayerControl().addOverlay(demColorLayer, "DEM Color (Elevation)");
}

// DEM Hillshade
function loadDemHillshadeTiles() {
  demHillshadeLayer = L.tileLayer("/data/processed/dem_tiles_hill/{z}/{x}/{y}.png", {
    attribution: "DEM Hillshade",
    maxZoom: 16,
    minZoom: 10,
    tms: true,
    opacity: 0.5,
    zIndex: 2
  }).addTo(map);

  ensureLayerControl().addOverlay(demHillshadeLayer, "DEM Hillshade");
}

// Layer control
let _layerControl = null;
function ensureLayerControl(){
  if (!_layerControl) {
    _layerControl = L.control.layers(null, {}, { collapsed: false }).addTo(map);
    _layerControl.addOverlay(osm, "OpenStreetMap");
  }
  return _layerControl;
}

// Custom Legend
const legend = L.control({ position: "bottomright" });

legend.onAdd = function (map) {
  const div = L.DomUtil.create("div", "info legend");
  div.innerHTML = `
    <h4>Legend</h4>
    <i style="background: red; border-radius: 50%; width: 12px; height: 12px; display: inline-block; margin-right: 5px;"></i> Schools<br>
    <i style="background: green; border-radius: 50%; width: 12px; height: 12px; display: inline-block; margin-right: 5px;"></i> Trees<br>
    <i style="background: orange; border-radius: 50%; width: 12px; height: 12px; display: inline-block; margin-right: 5px;"></i> Tree Clusters<br>
    <i style="background: #ffeb66; border: 1px solid black; width: 12px; height: 12px; display: inline-block; margin-right: 5px;"></i> Ward Boundaries<br>
    <i style="background: brown; width: 12px; height: 12px; display: inline-block; margin-right: 5px; opacity: 0.6;"></i> DEM Color<br>
    <i style="background: gray; width: 12px; height: 12px; display: inline-block; margin-right: 5px; opacity: 0.5;"></i> DEM Hillshade
  `;
  return div;
};

legend.addTo(map);


// ---------- Updated showWardInfo ----------
function showWardInfo(wardId, wardName, props={}){
  wardId = wkey(wardId);

  const statsKey = wardId || (props && props.__wardKey) || "";
  const stats = wardStats[statsKey] || props || {};
  const treeDist = treeCounts[statsKey] || treeCounts[wardId] || {};

  const numSchools = stats.num_schools ? Number(stats.num_schools) : 0;
  const avgElev = (stats.avg_elev !== null && stats.avg_elev !== undefined)
    ? Number(stats.avg_elev).toFixed(2)
    : "N/A";

  const totalTrees = Object.values(treeDist).reduce((s, v) => s + Number(v || 0), 0);

  console.log(`Showing info for Ward (${statsKey}). totalTrees from treeCounts:`, totalTrees, "treeDist:", treeDist);

  document.getElementById("ward-info").innerHTML = `
    <b>${wardName}</b><br/>
    <b>Ward id:</b> ${statsKey || wardId || "N/A"}<br/>
    <b>Schools:</b> ${numSchools}<br/>
    <b>Average elevation:</b> ${avgElev} m<br/>
    <b>Total trees (from census):</b> ${totalTrees}
  `;

  const labels = Object.keys(treeDist);
  const data = Object.values(treeDist).map(v => Number(v));

  const chartLabels = labels.length ? labels : ["No data"];
  const chartData = data.length ? data : [1];

  const ctx = document.getElementById("treeChart").getContext("2d");
  if (treeChart) treeChart.destroy();
  treeChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: generatePalette(chartLabels.length)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

// Colors
function generatePalette(n){
  const base = ["#4CAF50","#8BC34A","#FFC107","#FF5722","#03A9F4","#9C27B0","#795548","#00BCD4","#CDDC39","#FF9800","#607D8B"];
  if (n <= base.length) return base.slice(0,n);
  const out = [];
  for (let i=0;i<n;i++){
    out.push(base[i % base.length]);
  }
  return out;
}
