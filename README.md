# Bengaluru GIS Web Application

This is a GIS-based web application developed using **Flask (Python backend)** and **Leaflet.js (frontend)**.  
It visualizes **ward boundaries, schools, trees, and DEM data** for Bengaluru city, along with interactive charts (pie charts for tree counts).

---

## Features
- Display of **Bengaluru ward boundaries**.
- Overlay of **schools** and **tree census data**.
- Integration of **Digital Elevation Model (DEM)** layer.
- Interactive **pie chart visualization** of tree species per ward.
- Backend API built with **Flask** serving processed data as GeoJSON/CSV.
- Data preprocessing with **GeoPandas + Pandas**.

---

## Project Structure
```text
bengaluru-gis-app/
│
├── app/ # Flask backend
│   ├── static/ # Frontend JS, CSS, HTML
│   │   ├── app.js
│   │   ├── index.html
│   │   └── style.css
│   └── server.py # Flask app entry point
│
├── data/ # raw & processed data
│   ├── wards.geojson
│   ├── schools.geojson
│   ├── trees.geojson
│   ├── dem.tif
│   └── ward_tree_counts.csv
│
├── scripts/ # Preprocessing scripts
│   └── preprocess_data.py
├── app_snippet/ # PNG Screenshots of Web Application
├── requirements.txt # Python dependencies
├── README.md # Project documentation
└── Report.pdf # Project report
````

---

## Installation & Setup

### 0. Dataset Downloads

* Tree Census Data of Bengaluru: [Link](https://data.opencity.in/dataset/bengaluru-tree-census-data)
* Bengaluru Ward Boundaries: [Link](https://github.com/datameet/Municipal_Spatial_Data/blob/master/Bangalore/BBMP.geojson)
* Bengaluru Schools Data: [Overpass Turbo](https://overpass-turbo.eu/)
* Digital Elevation Model (DEM): [NASADEM](https://planetarycomputer.microsoft.com/dataset/nasadem#overview)

### 1. Clone the Repository

```bash
git clone https://github.com/aryanvivek01/bengaluru-gis-app.git
cd bengaluru-gis-app
```

### 2. Setup Python Environment

#### Create virtual environment

```bash
python -m venv venv
```

Activate it:

```bash
# Linux/Mac
source venv/bin/activate

# Windows
venv\Scripts\activate
```

#### Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Run Data Preprocessing

```bash
python scripts/preprocess_data.py
```

This generates:

* `data/ward_tree_counts.csv`
* Processed GeoJSONs for trees, schools, and wards

> Also, follow instructions to add and create colored DEM tiles for elevation and hillshade.

### 4. Start Flask App

```bash
cd app
flask run
```

Visit: [http://127.0.0.1:5000](http://127.0.0.1:5000)

---

## Usage

* Zoom/pan around Bengaluru wards.
* Click on a ward to see tree distribution pie chart.
* Toggle DEM, schools, and tree layers.

---

## Future Improvements

* Add time-series analysis of tree census.
* Improve DEM visualization with hillshade.
* Deploy on Heroku / AWS / Azure for public access.
* Add search/filter tools for schools and wards.

---

### Author

Vivek Aryan