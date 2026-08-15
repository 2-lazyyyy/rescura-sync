import json
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages active WebSocket client connections and maintains in-memory state
    for locked disasters across multiple concurrent dispatcher sessions.
    """

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        # locked_disasters structure: { "disaster_id": { "locked_by": "Dispatcher_1234", "timestamp": "2026-08-11T..." } }
        self.locked_disasters: Dict[str, Dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket) -> None:
        """Accepts a new WebSocket connection and adds it to the active connection list."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total active connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        """Removes a disconnected WebSocket connection from the active list."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Remaining active connections: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """Broadcasts a JSON message dictionary to all currently connected WebSocket clients."""
        disconnected_sockets: List[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Error broadcasting message to WebSocket client: {e}")
                disconnected_sockets.append(connection)

        # Cleanup disconnected sockets encountered during broadcast
        for stale_socket in disconnected_sockets:
            self.disconnect(stale_socket)

    def lock_disaster(self, disaster_id: str, locked_by: str) -> Dict[str, Any]:
        """Locks a disaster event for a specific dispatcher."""
        disaster_key = str(disaster_id)
        lock_info = {
            "locked_by": locked_by,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        self.locked_disasters[disaster_key] = lock_info
        return lock_info

    def unlock_disaster(self, disaster_id: str) -> Optional[Dict[str, Any]]:
        """Unlocks a disaster event if currently locked."""
        disaster_key = str(disaster_id)
        return self.locked_disasters.pop(disaster_key, None)

    def is_locked(self, disaster_id: str) -> bool:
        """Checks whether a disaster is currently locked."""
        return str(disaster_id) in self.locked_disasters


# Global ConnectionManager instance
manager = ConnectionManager()
