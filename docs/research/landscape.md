# Landscape: Existing "State of the World" Tools

Research from 2026-10-28. Six archetypes, each with a different idea of what "the state of the world" means.

| Archetype | Example | What to borrow |
| --- | --- | --- |
| Situation room | [World Monitor](https://www.worldmonitor.app/): 500+ feeds, 65+ data providers, live map with toggleable layers | Signal convergence over headlines; the map as the main surface |
| Ritual briefing | [Kagi News](https://blog.kagi.com/kagi-news): one cited briefing per day, about five minutes | Finitude as a feature |
| Meta-lens | [Ground News](https://ground.news/): Blindspot shows stories covered by only one side | Showing the shape of attention, not just events |
| Analyst terminal | Bloomberg; [OpenBB](https://github.com/OpenBB-finance/OpenBB) (open source, FRED/IMF/BLS data) | Density, keyboard-driven, numbers first |
| Personal startpage | Glance (self-hosted, YAML-configured widgets: RSS, Hacker News, markets) | Modular widgets you own |
| Probability layer | Prediction markets such as Polymarket | A forward-looking view of what might happen |

Core tension across all of them: live versus finite, raw signal versus synthesis. This project leans toward the situation room, grounded on a map, with evidence shown rather than interpreted.

## Data for map overlays

- **Basins:** [USGS World Petroleum Assessment provinces](https://sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3) (76 priority provinces hold 95% of known non-U.S. petroleum), [CGG Sedimentary Basins of the World via AAPG](https://datapages.com/gis-map-publishing-program/gis-open-files/global-framework/cgg-sedimentary-basins-of-the-world), [NETL basins layer](https://arcgis.netl.doe.gov/server/rest/services/CO2Locate_GOGI/MapServer/16) (queryable as GeoJSON).
- **Critical minerals:** [USGS global mines, deposits and districts for 22 critical minerals](https://www.usgs.gov/data/global-distribution-selected-mines-deposits-and-districts-critical-minerals) (public domain, reflects 2017).
- **Energy assets of every type:** [Global Energy Monitor](https://globalenergymonitor.org/) trackers, including the Energy Ownership Tracker that links companies to assets.

## Intellectual grounding

Daniel Yergin, *The Prize* and *The New Map*; Helen Thompson, *Disorder*.
