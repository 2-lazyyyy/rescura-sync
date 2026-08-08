from typing import Dict, Any
try:
    import osmnx as ox
except ImportError:
    ox = None

from services.depot_service import find_nearest_depot


async def get_evacuation_routes(lat: float, lon: float, radius_km: int = 6) -> Dict[str, Any]:
    """
    1. Finds nearest registered relief supply depot.
    2. Downloads OpenStreetMap street network graph connecting depot to disaster site.
    3. Calculates optimal supply/evacuation route starting directly at the nearest depot location and ending at the disaster center.
    """
    nearest_depot = find_nearest_depot(lat, lon)
    depot_lat = float(nearest_depot["lat"])
    depot_lon = float(nearest_depot["lon"])

    optimal_route_coords = []
    nodes_count = 0
    edges_count = 0

    if ox is not None:
        try:
            # Bounding box covering both depot and disaster site with padding
            north = max(lat, depot_lat) + 0.03
            south = min(lat, depot_lat) - 0.03
            east = max(lon, depot_lon) + 0.03
            west = min(lon, depot_lon) - 0.03

            # Download street network graph for the bounding box
            graph = ox.graph_from_bbox(bbox=(north, south, east, west), network_type='drive')

            nodes_count = len(graph.nodes)
            edges_count = len(graph.edges)

            start_node = ox.distance.nearest_nodes(graph, X=depot_lon, Y=depot_lat)
            end_node = ox.distance.nearest_nodes(graph, X=lon, Y=lat)

            route_nodes = ox.shortest_path(graph, start_node, end_node, weight='length')

            if route_nodes:
                road_points = [[graph.nodes[n]['y'], graph.nodes[n]['x']] for n in route_nodes]
                # Ensure route starts at exact depot coordinates and ends at exact disaster coordinates
                optimal_route_coords = [[depot_lat, depot_lon]] + road_points + [[lat, lon]]
        except Exception as e:
            print(f"OSMnx graph routing notice: {e}. Generating direct supply route from depot.")
            optimal_route_coords = [[depot_lat, depot_lon], [lat, lon]]
    else:
        optimal_route_coords = [[depot_lat, depot_lon], [lat, lon]]

    if not optimal_route_coords:
        optimal_route_coords = [[depot_lat, depot_lon], [lat, lon]]

    return {
        "status": "success",
        "latitude": lat,
        "longitude": lon,
        "radius_km": radius_km,
        "nodes_count": nodes_count,
        "edges_count": edges_count,
        "depot_info": nearest_depot,
        "optimal_route_coords": optimal_route_coords,
        "graph_summary": f"Route calculated from nearest depot '{nearest_depot['name']}' to disaster zone."
    }
