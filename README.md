# Orbito

A fully offline, browser-based management system designed for robotics teams to handle everything from parts and inventory to tasks and workspace organization.

## Features

- **Authentication:** Single sign-on via Google (Firebase Auth). Role-based access control with Mentor / Lead / Student tiers.
- **Projects:** Manage top-level projects and sub-projects. Track completion progress across assigned tasks.
- **Parts / Inventory:** Track part quantities, locations, vendors, and photos. Quickly adjust stock levels.
- **Bill of Materials (BOM):** Build BOMs for specific projects, track part procurement statuses, compute line totals, and export as CSV.
- **Vendors:** Directory of suppliers linked to parts.
- **Tools:** Track tool condition, location, and check-out status to team members.
- **People:** Manage team members and roles. See assigned tasks and checked-out tools at a glance.
- **Tasks (Kanban):** Simple kanban board to track tasks by assignee and project.
- **Workspace Map:** Visually lay out your shop with zones, and click a zone to see the parts and tools located there.
- **Local First:** Uses modern IndexedDB. No backend required. Works offline.
- **Import / Export:** Easily backup all your team data to a JSON file and load it on another device. Optionally exclude PII (emails, contact info) when exporting for sharing.

## How to Run

Since Orbito is a 100% front-end application, there is no server to run.

1. Clone the repository.
2. Open `index.html` in your web browser.

*Note: If you run into strict CORS issues loading ES modules (`import`), you can serve it via a simple local server:*

```bash
python3 -m http.server
```

Then visit `http://localhost:8000`.

## Architecture

- **`index.html`**: The main application shell and UI layout.
- **`style.css`**: A full custom CSS framework (dark theme).
- **`db.js`**: A lightweight wrapper around standard `IndexedDB` to handle fast CRUD operations.
- **`app.js`**: Core routing, module registry, and global helpers.
- **`modules/*.js`**: Isolated feature modules that handle their own data loading and DOM rendering.
