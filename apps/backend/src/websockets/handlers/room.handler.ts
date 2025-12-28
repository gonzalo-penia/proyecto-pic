import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RoomsService } from '../../rooms/rooms.service';
import { GamesService } from '../../games/games.service';
import { ConnectionHandler } from './connection.handler';
import {
  JoinRoomData,
  LeaveRoomData,
  JoinRoomResponse,
  LeaveRoomResponse,
} from './types';

@Injectable()
export class RoomHandler {
  private readonly logger = new Logger('RoomHandler');

  constructor(
    private readonly roomsService: RoomsService,
    private readonly gamesService: GamesService,
    private readonly connectionHandler: ConnectionHandler,
  ) {}

  /**
   * Maneja la unión de un jugador a una sala
   */
  async handleJoinRoom(
    client: Socket,
    data: JoinRoomData,
    server: Server,
  ): Promise<JoinRoomResponse> {
    const user = client.data.user;

    try {
      // Verificar que la sala existe
      const room = await this.roomsService.findByRoomCode(data.roomCode);

      // Validar que la sala no esté llena
      if (this.gamesService.isRoomFull(data.roomCode, room.maxPlayers)) {
        return {
          success: false,
          message: 'Room is full',
        };
      }

      // Agregar jugador al tracking
      this.gamesService.addPlayerToRoom(data.roomCode, user.sub);

      // Unir al cliente a la room de Socket.io
      await client.join(data.roomCode);

      // Guardar la relación socket-room
      this.connectionHandler.setClientRoom(client.id, data.roomCode);

      this.logger.log(
        `User ${user.username} joined room ${data.roomCode} (${this.gamesService.getPlayerCount(data.roomCode)}/${room.maxPlayers})`,
      );

      // Obtener lista actualizada de jugadores
      const connectedPlayers = this.gamesService.getConnectedPlayers(data.roomCode);

      // PRIMERO: Enviar al jugador que se une la lista completa de jugadores actuales
      // Obtener todos los sockets del namespace usando fetchSockets()
      const allSockets = await server.fetchSockets();

      client.emit('room_state', {
        roomCode: data.roomCode,
        players: connectedPlayers.map(playerId => {
          // Obtener info del jugador del socket
          const playerSocket = allSockets.find((s) => s.data?.user?.sub === playerId);
          return {
            userId: playerId,
            username: playerSocket?.data?.user?.username || 'Unknown',
            email: playerSocket?.data?.user?.email,
          };
        }),
        playerCount: connectedPlayers.length,
        maxPlayers: room.maxPlayers,
      });

      // SEGUNDO: Notificar a los demás en la sala que un nuevo jugador se unió
      client.to(data.roomCode).emit('player_joined', {
        userId: user.sub,
        username: user.username,
        email: user.email,
        roomCode: data.roomCode,
        playerCount: connectedPlayers.length,
        maxPlayers: room.maxPlayers,
        timestamp: Date.now(),
      });

      // Retornar confirmación al cliente
      return {
        success: true,
        message: 'Successfully joined room',
        roomCode: data.roomCode,
        roomId: room.id,
        playerCount: connectedPlayers.length,
        maxPlayers: room.maxPlayers,
      };
    } catch (error) {
      this.logger.error(
        `Error joining room: ${error.message}`,
      );

      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Maneja la salida de un jugador de una sala
   */
  async handleLeaveRoom(
    client: Socket,
    data: LeaveRoomData,
  ): Promise<LeaveRoomResponse> {
    const user = client.data.user;

    try {
      // Remover jugador del tracking
      this.gamesService.removePlayerFromRoom(data.roomCode, user.sub);

      // Salir de la room de Socket.io
      await client.leave(data.roomCode);

      // Remover la relación socket-room
      this.connectionHandler.deleteClientRoom(client.id);

      this.logger.log(
        `User ${user.username} left room ${data.roomCode}`,
      );

      // Notificar a los demás en la sala
      client.to(data.roomCode).emit('player_left', {
        userId: user.sub,
        username: user.username,
        roomCode: data.roomCode,
        playerCount: this.gamesService.getPlayerCount(data.roomCode),
        timestamp: Date.now(),
      });

      // Retornar confirmación al cliente
      return {
        success: true,
        message: 'Successfully left room',
        roomCode: data.roomCode,
      };
    } catch (error) {
      this.logger.error(
        `Error leaving room: ${error.message}`,
      );

      return {
        success: false,
        message: error.message,
      };
    }
  }
}
