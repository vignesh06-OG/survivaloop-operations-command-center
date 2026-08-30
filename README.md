# SurvivaLoop - Operations Command Center

## What SurvivaLoop is
SurvivaLoop is an operational decision-support and intervention management platform designed for **tree survival**. It is built to convert imperfect field evidence into feasible, accountable actions. 

> SENSE → ASSESS → DECIDE → COMMIT → ACT → PROVE → CHECK → ADAPT

## What the Operations Command Center does
The Operations Command Center is the domain-first, server-authoritative implementation of the SurvivaLoop logic. Every business rule lives in the domain layer; the UI never makes decisions and never grants access. It manages:
- **Decision Engine**: Deterministic, fully explainable generation of tasks.
- **Evidence Quality**: Evaluated deterministically to build confidence in conditions.
- **Capacity-aware commitment**: Ensures no task is committed unless capacity is feasible.
- **Task Lifecycle**: Managing tasks through a strict state machine (SLA escalation, verification loops).

## Major Mission Flow
The application models the following mission flow:
**Detection → Intervention Queue → Dispatch → Drone Arrival → Evidence Capture → AI Analysis → Human Verification → Recovery → Audit Log**

## Frontend Architecture
- **Next.js, React, Tailwind CSS**: Used purely for display and user interaction.
- The UI never trusts the client for authorization, roles, GPS coordinates, or timestamps.
- **State Management**: Server-validated transitions ensure the UI just reflects the server's truth.
- **Map Visualizations**: Clean, dependency-free SVG projection for the offline/preview MVP.

## Backend Architecture
- **API Routes (Next.js route handlers)**: The boundary handling Zod validation and sessions.
- **AppService (facade)**: Orchestrates workflows, persists data, and writes to audit logs.
- **Domain Services**: Pure logic implementations (e.g., `DecisionService`, `TaskService`) injected with dependencies.
- **Repository**: Currently using a SQLite runtime adapter (via `better-sqlite3`) that mirrors a PostgreSQL schema, to operate gracefully in local setups. The production schema targets PostgreSQL/PostGIS.

## GIS Implementation
- **Current (Local MVP)**: Uses a pure, dependency-free SVG coordinate projection for rapid prototype validation. 
- **Production Intent**: The database schema `docs/postgres-schema.sql` relies on **PostGIS** geometry types (Point, 4326) and spatial indexing (GIST) for zone and cluster bounding. The production interface will swap to MapLibre GL for web-based vector rendering and spatial clustering.

## Three.js Implementation
- **Status**: Pending integration. 
- **Goal**: To be used for realistic 3D GIS rendering of forest topography, Drone Delta dispatch animations, and immersive data overlays in the Operations Command Center.

## Shader Implementation
- **Status**: Pending integration.
- **Goal**: Custom WebGL shaders running alongside Three.js to render complex terrain heatmaps, fluid weather simulations, and biological severity markers across the forest map.

## How to Run Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
   The application will be available at `http://localhost:3000`. On first load, it self-seeds a simulated organisation demo. Log in using a demo identity.

## Environment Variables
Create a `.env` file at the root of the project (see `.env.example`).
Required variables:
- `SURVIVALOOP_JWT_SECRET`: Secret key used for signing JWT session cookies.

**Never commit your `.env` file to version control.**

## How to Build
To produce the optimized production bundle, run:
```bash
npm run build
```

## How to Test
Strict TypeScript checks and deterministic Node.js tests cover the mandated scenarios and business rules.
```bash
npm run typecheck     # Strict TypeScript validation
npm test              # Run the complete test suite
```

## Current Prototype Status
This project is currently in the MVP/Prototype phase but is evolving into a full software product. 
- **Implemented**: Core decision engine, capacity tracking, task lifecycle, audit trails, SQLite local database mirror, robust server-side security posture.
- **Next Milestones**: Transitioning GIS to MapLibre GL, integrating PostGIS production database, and hooking up Three.js/shaders for advanced geospatial and drone visualizations.
