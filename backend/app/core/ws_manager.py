import logging
from typing import Dict, List, Set, Optional
from fastapi import WebSocket

logger = logging.getLogger("ws-manager")

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.user_roles: Dict[str, str] = {}
        self.user_departments: Dict[str, str] = {}

    async def connect(self, websocket: WebSocket, user_id: str, role: str = "FACULTY", department_id: Optional[str] = None):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)
        self.user_roles[user_id] = role.upper()
        if department_id:
            self.user_departments[user_id] = department_id
        logger.info(f"WebSocket connected for user {user_id} ({role})")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                self.user_roles.pop(user_id, None)
                self.user_departments.pop(user_id, None)
        logger.info(f"WebSocket disconnected for user {user_id}")

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            for ws in list(self.active_connections[user_id]):
                try:
                    await ws.send_json(message)
                except Exception as e:
                    logger.warning(f"Failed to send WS to user {user_id}: {e}")

    async def broadcast_to_role(self, message: dict, target_role: str):
        target_role = target_role.upper()
        for user_id, role in list(self.user_roles.items()):
            if target_role in ["ALL", role]:
                await self.send_personal_message(message, user_id)

    async def broadcast_to_department(self, message: dict, department_id: str):
        for user_id, dept_id in list(self.user_departments.items()):
            if dept_id == department_id:
                await self.send_personal_message(message, user_id)

ws_manager = ConnectionManager()
