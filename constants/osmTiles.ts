/**
 * OpenStreetMap raster tile URL ({z}/{x}/{y}).
 * @see https://wiki.openstreetmap.org/wiki/Raster_tile_providers — production apps should follow
 * https://operations.osmfoundation.org/policies/tiles/ (cache, attribution, traffic); consider your own tile endpoint or a commercial provider at scale.
 */
export const OSM_TILE_TEMPLATE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
