"use client";
import { useState } from "react";
import MapCanvas, { MapData } from "@/components/MapCanvas";

const DUMMY_DATA: MapData = {
  clusters: [
    { id: "c1", code: "MC-07", name: "Agri-Zone 2", lat: 12.9784, lng: 77.3964 },
    { id: "c2", code: "MC-02", name: "Sector 4 NW", lat: 12.9810, lng: 77.4010 },
    { id: "c3", code: "MC-09", name: "Riparian Zone", lat: 12.9720, lng: 77.3900 },
  ],
  nodes: {
    "c1": { decision: "ACT", severe: true, nEvidence: 3 },
    "c2": { decision: "MONITOR", severe: false },
    "c3": { decision: "INSPECT", severe: false, nEvidence: 1 },
  },
  simulatedNote: "SIMULATED GIS PREVIEW"
};

export default function MapTestPage() {
  const [selected, setSelected] = useState<string | null>("c1");

  return (
    <div className="w-screen h-screen bg-black overflow-hidden flex">
      <div className="w-full h-full relative">
        <MapCanvas 
          data={DUMMY_DATA} 
          selected={selected} 
          onSelect={setSelected} 
        />
      </div>
    </div>
  );
}
