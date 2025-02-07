<template>
    <div>
        <div ref="map" class="map"></div>
        <div class="control-panel card">
            <div style="position: absolute;"><button class="btn btn-primary btn-sm" v-on:click="expandControlPanel = !expandControlPanel">-</button></div>
            <div class="card-body" v-bind:class="{ hidden: !expandControlPanel }">
                <div class="form-group">
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" id="check-grid-coords"
                               v-model="showGridCoordinates">
                        <label class="form-check-label" for="check-grid-coords">Show grid coordinates</label>
                    </div>
                    <div class="form-check">
                        <input type="checkbox" class="form-check-input" id="check-hide-markers"
                               v-model="hideMarkers">
                        <label class="form-check-label" for="check-hide-markers">Hide Markers</label>
                    </div>
                    <button type="button" class="btn btn-secondary" style="margin-top: 10px;" v-on:click="zoomOut">Zoom
                        out
                    </button>
                </div>
                <div class="form-group">
                    <label>Jump to Map</label>
                    <model-select :options="maps" v-model="selectedMap" placeholder="Select Map"></model-select>
                </div>
                <div class="form-group">
                    <label>Overlay Map</label>
                    <model-select :options="maps" v-model="overlayMap" placeholder="Select Map"></model-select>
                </div>
                <div class="form-group">
                    <label>Jump to Quest Giver</label>
                    <model-select :options="questGivers" v-model="selectedMarker"
                                  placeholder="Select Quest Giver"></model-select>
                </div>
                <div class="form-group">
                    <label>Jump to Player</label>
                    <model-select :options="players" v-model="selectedPlayer" placeholder="Select Player"></model-select>
                </div>
            </div>
        </div>
        <vue-context ref="menu">
            <template slot-scope="tile" v-if="tile.data">
                <li>
                    <a @click.prevent="wipeTile(tile.data)">Wipe tile {{ tile.data.coords.x }}, {{ tile.data.coords.y }}</a>
                </li>
                <li>
                    <a @click.prevent="queryCoordSet(tile.data)">Rewrite tile coords for {{ tile.data.coords.x }}, {{ tile.data.coords.y }}</a>
                </li>
            </template>
        </vue-context>

        <vue-context ref="markermenu">
            <template slot-scope="data" v-if="data.data">
                <li>
                    <a @click.prevent="hideMarker(data.data)">Hide marker {{ data.data.name }}</a>
                </li>
            </template>
        </vue-context>
        <modal name="coordSet">
            <form v-on:submit.prevent="setCoords()"> 
                <input v-model="coordSet.x" class="input" type="text" placeholder="0">
                <input v-model="coordSet.y" class="input" type="text" placeholder="0">
                <button class="button is-primary">Submit</button>
            </form>
        </modal>
    </div>
</template>

<script>
    import {ModelSelect} from 'vue-search-select'
    import {GridCoordLayer, HnHCRS, HnHMaxZoom, HnHMinZoom, TileSize} from "../utils/LeafletCustomTypes";
    import {SmartTileLayer} from "../utils/SmartTileLayer";
    import * as L from "leaflet";
    import {API_ENDPOINT} from "../main";
    import {Marker} from "../data/Marker";
    import {UniqueList} from "../data/UniqueList";
    import {Character} from "../data/Character";
    import { VueContext } from 'vue-context';

    export default {
        name: "MapView",
        components: {
            ModelSelect,
            VueContext,
        },
        data: function () {
            return {
                showGridCoordinates: false,
                hideMarkers: false,
                expandControlPanel: true,

                trackingCharacterId: -1,
                autoMode: false,
                polling: null,
                zz: false,
                markersCache: [],
                questGivers: [],
                players: [],
                maps: [],
                selectedMap: {value: false},
                selectedMarker: {value: false},
                selectedPlayer: {value: false},
                overlayMap: {value: false},
                auths: [],
                mapid: 0,
                coordSetFrom: {x: 0, y: 0},
                coordSet: {
                    x: 0,
                    y: 0
                }
            }
        },
        watch: {
            showGridCoordinates(value) {
                if(value) {
                    this.coordLayer.setOpacity(1);
                } else {
                    this.coordLayer.setOpacity(0);
                }
            },
            hideMarkers(value) {
                if(value) {
                    this.markers.getElements().forEach(it => it.remove(this));
                } else {
                    this.markers.getElements().filter(it => it.map == this.mapid || it.map == this.overlayLayer.map).forEach(it => it.add(this));
                }
                this.markersHidden = value;
            },
            trackingCharacterId(value) {
                if (value !== -1) {
                    let character = this.characters.byId(value);
                    if (character) {
                        this.changeMap(character.map);
                        let latlng = this.map.unproject([character.position.x, character.position.y], HnHMaxZoom);
                        this.map.setView(latlng, HnHMaxZoom);

                        this.$router.push({path: `/character/${value}`});
                        this.autoMode = true;
                    } else {
                        this.map.setView([0, 0], HnHMinZoom);
                        let mapid = this.maps[0].ID;
                        this.$router.replace({path: `/grid/${mapid}/0/0/${HnHMinZoom}`});
                        this.trackingCharacterId = -1;
                    }
                }
            },
            selectedMap(value) {
                if (value) {
                    this.changeMap(value.ID);
                    let zoom = this.map.getZoom();
                    this.map.setView([0, 0], zoom);
                    
                    this.$router.replace({path: `/grid/${this.mapid}/0/0/${zoom}`});
                }
            },
            overlayMap(value) {
                if (value) {
                    this.overlayLayer.map = value.ID;
                    this.overlayLayer.redraw();
                    if(!this.markersHidden) {
                        this.markers.getElements().forEach(it => it.remove(this));
                        this.markers.getElements().filter(it => it.map == this.mapid || it.map == this.overlayLayer.map).forEach(it => it.add(this));
                    }
                } else {
                    this.overlayLayer.map = -1;
                    this.overlayLayer.redraw();
                    if(!this.markersHidden) {
                        this.markers.getElements().forEach(it => it.remove(this));
                        this.markers.getElements().filter(it => it.map == this.mapid).forEach(it => it.add(this));
                    }
                }
            },
            selectedMarker(value) {
                if (value) {
                    this.map.setView(value.marker.getLatLng(), this.map.getZoom());
                }
            },
            selectedPlayer(value) {
                if (value && value.id) {
                    this.trackingCharacterId = value.id;
                }
            }
        },
        mounted() {
            let chars = this.$http.get(`${API_ENDPOINT}/v1/characters`)
            let maps = this.$http.get(`${API_ENDPOINT}/maps`)

            Promise.all([chars, maps]).then(values => {
                this.setupMap(values[0].body, values[1].body);
            }, () => this.$emit("error"));
        },
        beforeDestroy: function () {
            clearInterval(this.intervalId)
        },
        methods: {
            setupMap(characters, maps) {
                this.$http.get(`${API_ENDPOINT}/config`).then(response => {
                    this.processConfig(response.body);
                }, () => this.$emit("error"));
                // Create map and layer
                this.map = L.map(this.$refs.map, {
                    // Map setup
                    minZoom: HnHMinZoom,
                    maxZoom: HnHMaxZoom,
                    crs: HnHCRS,

                    // Disable all visuals
                    attributionControl: false,
                    inertia: true,
                    zoomAnimation: true,
                    fadeAnimation: true,
                    markerZoomAnimation: true
                });

                for (let id in maps) {
                    let map = maps[id];
                    map.text = map.Name;
                    map.value = map.ID;
                    this.maps.push(map);
                }
                this.maps.sort((a, b) => {
                    return a.size < b.size;
                });

                // Update url on manual drag, zoom
                this.map.on("drag", () => {
                    let point = this.map.project(this.map.getCenter(), 6);
                    let coordinate = {x: ~~(point.x / TileSize), y: ~~(point.y / TileSize), z: this.map.getZoom()};
                    this.$router.replace({path: `/grid/${this.mapid}/${coordinate.x}/${coordinate.y}/${coordinate.z}`});
                    this.trackingCharacterId = -1;
                });
                this.map.on("zoom", () => {
                    if (this.autoMode) {
                        this.autoMode = false;
                    } else {
                        let point = this.map.project(this.map.getCenter(), 6);
                        let coordinate = {x: Math.floor(point.x / TileSize), y: Math.floor(point.y / TileSize), z: this.map.getZoom()};
                        this.$router.replace({path: `/grid/${this.mapid}/${coordinate.x}/${coordinate.y}/${coordinate.z}`});
                        this.trackingCharacterId = -1;
                    }
                });
         
                this.layer = new SmartTileLayer('grids/{map}/{z}/{x}_{y}.png?{cache}', {minZoom: 1, maxZoom: 6, zoomOffset:0, zoomReverse: true, tileSize: TileSize});
                this.layer.invalidTile = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
                this.layer.addTo(this.map);

                this.overlayLayer = new SmartTileLayer('grids/{map}/{z}/{x}_{y}.png?{cache}', {minZoom: 1, maxZoom: 6, zoomOffset:0, zoomReverse: true, tileSize: TileSize, opacity: 0.5});
                this.overlayLayer.invalidTile = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
                this.overlayLayer.addTo(this.map);

                this.coordLayer = new GridCoordLayer({tileSize: TileSize, opacity: 0});
                this.coordLayer.addTo(this.map);

                this.markerLayer = L.layerGroup();
                this.markerLayer.addTo(this.map);

                /*this.map.on('mousemove', (mev) => {
                    coords = this.map.project(mev.latlng, 6);
                })*/

                this.map.on('contextmenu', ((mev) => {
                    if(this.auths.includes('admin')){
                        let point = this.map.project(mev.latlng, 6);
                        let coords = {x: Math.floor(point.x / TileSize), y: Math.floor(point.y / TileSize)};
                        this.$refs.menu.open(mev.originalEvent, { coords: coords });
                    }
                }).bind(this));

                this.source = new EventSource("updates");
                this.source.onmessage = (function(event) {
                    var updates = JSON.parse(event.data);
                    for(var update of updates) {
                        var key = update['M'] + ':' + update['X'] + ':' + update['Y'] + ':' + update['Z'];
                        this.layer.cache[key] = update['T'];
                        if(this.layer.map == update['M']) {
                            this.layer.refresh(update['X'], update['Y'], update['Z']);
                        }
                    }
                }).bind(this);

                this.source.addEventListener('merge', ((e)=> {
                    var merge = JSON.parse(e.data);
                    if(this.mapid == merge['From']) {
                        let mapTo = merge['To'];
                        let point = this.map.project(this.map.getCenter(), 6);
                        let coordinate = {x: Math.floor(point.x / TileSize), y: Math.floor(point.y / TileSize), z: this.map.getZoom()};
                        coordinate.x += merge['Shift'].x;
                        coordinate.y += merge['Shift'].y;
                        this.$router.replace({path: `/grid/${mapTo}/${coordinate.x}/${coordinate.y}/${coordinate.z}`});

                        let latLng = this.toLatLng(coordinate.x * 100, coordinate.y * 100);

                        this.changeMap(mapTo);
                        this.$http.get(`${API_ENDPOINT}/v1/markers`).then(response => {
                            this.updateMarkers(response.body);
                        }, () => {
                            this.$emit("error")
                        });
                        this.map.setView(latLng, this.map.getZoom());
                    }
                }).bind(this));

                this.markers = new UniqueList();
                this.characters = new UniqueList();

                // Create markers
                this.updateCharacters(characters);

                // Check parameters
                if (this.$route.params.characterId) { // Navigate to character
                    this.trackingCharacterId = +this.$route.params.characterId;
                } else if (this.$route.params.gridX && this.$route.params.gridY && this.$route.params.zoom) { // Navigate to specific grid
                    let latLng = this.toLatLng(this.$route.params.gridX * 100, this.$route.params.gridY * 100);

                    if(this.mapid != this.$route.params.map) {
                        this.changeMap(this.$route.params.map);
                    }

                    this.map.setView(latLng, this.$route.params.zoom);
                } else { // Just show a map
                    if(this.maps.length > 0) {
                        this.changeMap(this.maps[0].ID);
                    }
                    this.map.setView([0, 0], HnHMinZoom);
                }

                this.intervalId = setInterval(() => {
                    this.$http.get(`${API_ENDPOINT}/v1/characters`).then(response => {
                        this.updateCharacters(response.body);
                    }, () => {
                        clearInterval(this.intervalId);
                        this.$emit("error")
                    });
                }, 2000);
                // Request markers
                this.$http.get(`${API_ENDPOINT}/v1/markers`).then(response => {
                    this.updateMarkers(response.body);
                }, () => {
                    this.$emit("error")
                });
            },
            updateMarkers(markersData) {
                this.markers.update(markersData.map(it => new Marker(it)),
                    (marker) => { // Add
                        if(marker.map == this.mapid || marker.map == this.overlayLayer.map) {
                            marker.add(this);
                        }
                        marker.setClickCallback(() => {
                            this.map.setView(marker.marker.getLatLng(), HnHMaxZoom);
                        });
                        marker.setContextMenu((mev) => {
                            if(this.auths.includes('admin')){
                                this.$refs.markermenu.open(mev.originalEvent, { name: marker.name, id: marker.id });
                            }
                        });
                    },
                    (marker) => { // Remove
                        marker.remove(this);
                    },
                    (marker, updated) => { // Update
                        marker.update(this, updated);
                    });
                this.markersCache.length = 0;
                this.markers.getElements().forEach(it => this.markersCache.push(it));

                this.questGivers.length = 0;
                this.markersCache.filter(it => it.type === "quest").forEach(it => this.questGivers.push(it));
            },
            updateCharacters(charactersData) {
                this.characters.update(charactersData.map(it => new Character(it)),
                    (character) => { // Add
                        character.add(this);
                        character.setClickCallback(() => { // Zoom to character on marker click
                            this.trackingCharacterId = character.id;
                        });
                    },
                    (character) => { // Remove
                        character.remove(this);
                    },
                    (character, updated) => { // Update
                        if (this.trackingCharacterId == updated.id) {
                            if(this.mapid != updated.map) {
                                this.changeMap(updated.map);
                            }
                            let latlng = this.map.unproject([updated.position.x, updated.position.y], HnHMaxZoom);
                            this.map.setView(latlng, HnHMaxZoom);
                        }
                        character.update(this, updated);
                    }
                );
                this.players.length = 0;
                this.characters.getElements().forEach(it => this.players.push(it));
            },
            processConfig(config) {
                document.title = config.title;
                this.auths = config.auths;
            },
            toLatLng(x, y) {
                return this.map.unproject([x, y], HnHMaxZoom);
            },
            zoomOut() {
                this.trackingCharacterId = -1;
                this.map.setView([0, 0], HnHMinZoom);
            },
            wipeTile(data) {
                this.$http.get(`${API_ENDPOINT}/admin/wipeTile`, {params: {...data.coords, map: this.mapid} });
            },
            hideMarker(data) {
                this.$http.get(`${API_ENDPOINT}/admin/hideMarker`, {params: {id: data.id}});
                this.markers.byId(data.id).remove(this);
            },
            queryCoordSet(data) {
                this.coordSetFrom = data.coords;
                this.$modal.show('coordSet');
            },
            setCoords() {
                this.$http.get(`${API_ENDPOINT}/admin/setCoords`, {params: {
                    map: this.mapid,
                    fx: this.coordSetFrom.x, 
                    fy: this.coordSetFrom.y,
                    tx: this.coordSet.x, 
                    ty: this.coordSet.y,
                }});
            },
            changeMap(mapid) {
                if(mapid != this.mapid) {
                    this.mapid = mapid;
                    this.layer.map = this.mapid;
                    this.layer.redraw();
                    this.overlayLayer.map = -1;
                    this.overlayLayer.redraw();
                    if(!this.markersHidden) {
                        this.markers.getElements().forEach(it => it.remove(this));
                        this.markers.getElements().filter(it => it.map == this.mapid).forEach(it => it.add(this));
                    }
                    this.characters.getElements().forEach(it => {
                        it.remove(this);
                        it.add(this);
                    });
                }
            }
        }
    }
</script>

<style>
    .map {
        height: 100vh;
    }

    .leaflet-container {
        background: #000;
    }

    .map-tile {
        border-bottom: 1px solid #404040;
        border-right: 1px solid #404040;
        color: #404040;
        font-size: 12px;
    }

    .map-tile-text {
        position: absolute;
        left: 2px;
        top: 2px;
    }

    .control-panel {
        position: absolute;
        top: 10%;
        left: 10px;
        z-index: 502;
    }

    .hidden {
        display: none;
    }
    
    @import  '~vue-context/dist/css/vue-context.css';
</style>