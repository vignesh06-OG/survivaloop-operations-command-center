"use client";
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { DECISION_COLORS, SLA_COLORS, FALLBACK_TASK_COLOR } from "@/lib/present";
import { useTranslation } from "@/lib/i18n/I18nContext";
import type { MapData } from "./MapCanvas";

export default function RealMap({ data, selected, onSelect, isFieldView, onError }: {
  data: MapData;
  selected: string | null;
  onSelect: (id: string) => void;
  isFieldView?: boolean;
  onError?: () => void;
}) {
  const { t } = useTranslation();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return; // Initialize once

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          "esri-satellite": {
            type: "raster",
            tiles: [
              "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            ],
            tileSize: 256,
            attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
          }
        },
        layers: [
          {
            id: "satellite",
            type: "raster",
            source: "esri-satellite",
            minzoom: 0,
            maxzoom: 22
          }
        ]
      },
      center: [73.7898, 19.9975], // Nashik region
      zoom: 12,
      pitch: 45,
      bearing: -17.6,
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true, visualizePitch: true }), "top-right");
    if (isFieldView) {
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
        }),
        "bottom-right"
      );
    }

    map.on("load", () => {
      // Add empty GeoJSON source for clustering
      map.addSource("clusters", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      // Cluster circle layer
      map.addLayer({
        id: "clusters-layer",
        type: "circle",
        source: "clusters",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#34d399", // green for small
            5,
            "#facc15", // yellow for medium
            10,
            "#ef4444", // red for large
          ],
          "circle-radius": ["step", ["get", "point_count"], 15, 5, 20, 10, 25],
        },
      });

      // Cluster count text layer
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "clusters",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Arial Unicode MS Bold"],
          "text-size": 12,
        },
        paint: { "text-color": "#ffffff" },
      });

      // Zoom on cluster click
      map.on("click", "clusters-layer", (e: any) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["clusters-layer"] });
        if (!features[0]) return;
        const clusterId = features[0].properties?.cluster_id;
        const source = map.getSource("clusters") as maplibregl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId).then((zoom: any) => {
          if (zoom == null || !features[0].geometry || features[0].geometry.type !== "Point") return;
          map.easeTo({
            center: features[0].geometry.coordinates as [number, number],
            zoom: zoom + 1,
          });
        });
      });

      map.on("mouseenter", "clusters-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "clusters-layer", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [isFieldView]);

  // Update GeoJSON data and HTML markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Build GeoJSON for clustering
    const features: GeoJSON.Feature[] = data.clusters.map((c) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
      properties: { id: c.id, code: c.code, name: c.name, ...data.nodes[c.id] },
    }));

    const updateSource = () => {
      const source = map.getSource("clusters") as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: "FeatureCollection", features });
      }
    };
    if (map.isStyleLoaded()) { updateSource(); } else { map.once("load", updateSource); }

    // Define function to update HTML markers based on unclustered points
    const updateMarkers = () => {
      if (!map.getSource("clusters")) return;
      const unclustered = map.querySourceFeatures("clusters", {
        filter: ["!", ["has", "point_count"]],
      });

      // Keep track of visible markers to remove old ones
      const visibleIds = new Set(unclustered.map((f: any) => f.properties?.id));
      
      Object.keys(markersRef.current).forEach((id) => {
        if (!visibleIds.has(id)) {
          markersRef.current[id].remove();
          delete markersRef.current[id];
        }
      });

      unclustered.forEach((f: any) => {
        if (f.geometry.type !== "Point") return;
        const props = f.properties;
        if (!props?.id) return;
        
        if (!markersRef.current[props.id]) {
          // Create marker element
          const el = document.createElement("div");
          el.className = "marker-dot";
          el.style.width = "16px";
          el.style.height = "16px";
          el.style.borderRadius = "50%";
          el.style.cursor = "pointer";
          
          let color = "#6b7c6f";
          if (props.sla === "EXPIRED") color = "#1f2937";
          else if (props.decision === "ACT") color = "#ef4444";
          else if (props.decision === "INSPECT") color = "#eab308";
          else if (props.decision === "MONITOR") color = "#22c55e";
          else if (props.decision) color = (DECISION_COLORS as any)[props.decision] || color;
          else if (props.taskState) color = (FALLBACK_TASK_COLOR as any)[props.taskState] || color;
            
          el.style.backgroundColor = color;
          
          // Pulsing for Critical (ACT) or EXPIRED
          if (props.sla === "EXPIRED" || props.decision === "ACT") {
            el.innerHTML = `<div style="position:absolute; inset:-4px; border-radius:50%; border:2px solid ${color}; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`;
          }

          // Border for selected
          if (props.id === selected) {
            el.style.border = "2px solid white";
            el.style.boxShadow = "0 0 10px white";
            el.style.zIndex = "100";
          } else {
            el.style.border = `2px solid ${color}`;
            el.style.zIndex = "1";
          }

          el.onclick = (e) => {
            e.stopPropagation();
            onSelect(props.id);
          };

          // Popup uses i18n
          const popupContent = `
            <div style="color: #333; padding: 4px;">
              <strong style="display:block; font-size: 14px; margin-bottom: 2px;">${props.code}</strong>
              <div style="font-size: 12px; margin-bottom: 4px;">${props.name}</div>
              <div style="font-size: 11px;">${t("map.decision") || "Decision"}: <b>${props.decision || "N/A"}</b></div>
              <div style="font-size: 11px;">SLA: <b>${props.sla || "NORMAL"}</b></div>
              ${props.nEvidence ? `<div style="font-size: 11px; margin-top: 4px; padding-top: 4px; border-top: 1px solid #ccc;">Evidence: <b>${props.nEvidence}</b></div>` : ""}
            </div>
          `;

          const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(popupContent);
          
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat(f.geometry.coordinates as [number, number])
            .setPopup(popup)
            .addTo(map);
            
          markersRef.current[props.id] = marker;
        } else {
          // Update selected style if needed
          const el = markersRef.current[props.id].getElement();
          if (props.id === selected) {
            el.style.border = "2px solid white";
            el.style.boxShadow = "0 0 10px white";
            el.style.zIndex = "100";
          } else {
            el.style.border = `2px solid ${el.style.backgroundColor}`;
            el.style.boxShadow = "none";
            el.style.zIndex = "1";
          }
        }
      });
    };

    map.on("data", updateMarkers);
    map.on("move", updateMarkers);
    
    // Initial update
    updateMarkers();

    return () => {
      map.off("data", updateMarkers);
      map.off("move", updateMarkers);
    };
  }, [data, selected, onSelect, t]); 

  // Fly to selected cluster
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;

    const cluster = data.clusters.find((c) => c.id === selected);
    if (cluster) {
      map.flyTo({ center: [cluster.lng, cluster.lat], zoom: 14, duration: 1500 });
      // Show popup for selected if it exists in markers
      const marker = markersRef.current[selected];
      if (marker && marker.getPopup() && !marker.getPopup()!.isOpen()) {
        marker.togglePopup();
      }
    }
  }, [selected, data.clusters]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "400px", background: "#050806" }}>
      <div ref={mapContainerRef} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, minHeight: "400px" }} />
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        .maplibregl-popup-content {
          border-radius: 8px;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
      `}} />
    </div>
  );
}
