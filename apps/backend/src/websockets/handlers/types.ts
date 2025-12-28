export interface JoinRoomData {
  roomCode: string;
}

export interface LeaveRoomData {
  roomCode: string;
}

export interface JoinRoomResponse {
  success: boolean;
  message: string;
  roomCode?: string;
  roomId?: string;
  playerCount?: number;
  maxPlayers?: number;
}

export interface LeaveRoomResponse {
  success: boolean;
  message: string;
  roomCode?: string;
}

export interface AssignTeamsData {
  roomCode: string;
  team1UserIds: string[];
  team2UserIds: string[];
}

export interface AssignTeamsRandomData {
  roomCode: string;
}

export interface TeamAssignmentResponse {
  success: boolean;
  message: string;
}
