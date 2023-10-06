/* eslint-disable */
import {HnHMaxZoom, ImageIcon} from "../utils/LeafletCustomTypes";
import * as L from "leaflet";

export class Character {
    constructor(characterData) {
        this.name = characterData.name;
        this.position = characterData.position;
        this.image = characterData.image;
        this.type = characterData.type;
        this.id = characterData.id;
        this.map = characterData.map;
        this.marker = false;
        this.text = this.name;
        this.value = this.id;
        this.onClick = null;
    }

    getId() {
        return `${this.name}`;
    }

    remove(mapview) {
        if (this.marker) {
            mapview.map.removeLayer(this.marker);
            this.marker = null;
        }
    }

    add(mapview) {
        if(this.map == mapview.mapid) {
            let icon;
            if(this.image == "") {
                icon = new ImageIcon({iconUrl: 'gfx/invobjs/sprucecap.png', iconSize: [32, 32]})
            } else {
                icon = new ImageIcon({iconUrl: `${this.image}.png`, iconSize: [32, 32]});
            }

            let position = mapview.map.unproject([this.position.x, this.position.y], HnHMaxZoom);
            this.marker = L.marker(position, {icon: icon, title: this.name});
            this.marker.on("click", this.callCallback.bind(this));
            this.marker.addTo(mapview.map)
        };
    }

    update(mapview, updated) {
        if(this.map != updated.map) {
            this.remove(mapview);
        }
        this.map = updated.map;
        this.position = updated.position;
        if (!this.marker && this.map == mapview.mapid) {
            this.add(mapview);
        }
        if(this.marker) {
            let position = mapview.map.unproject([updated.position.x, updated.position.y], HnHMaxZoom);
            this.marker.setLatLng(position);
        }
    }

    setClickCallback(callback) {
        this.onClick = callback;
    }

    callCallback(e) {
        if(this.onClick != null) {
            this.onClick(e);
        }
    }
}