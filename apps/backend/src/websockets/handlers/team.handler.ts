import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RoomsService } from '../../rooms/rooms.service';
import { GamesService } from '../../games/games.service';
import {
  AssignTeamsData,
  AssignTeamsRandomData,
  TeamAssignmentResponse,
} from './types';

@Injectable()
export class TeamHandler {
  private readonly logger = new Logger('TeamHandler');

  constructor(
    private readonly roomsService: RoomsService,
    private readonly gamesService: GamesService,
  ) {}

  /**
   * Asigna equipos de forma manual
   */
  async handleAssignTeams(
    client: Socket,
    data: AssignTeamsData,
    server: Server,
  ): Promise<TeamAssignmentResponse> {
    const user = client.data.user;

    try {
      // Verificar que la sala existe
      const room = await this.roomsService.findByRoomCode(data.roomCode);

      // Validar que el usuario es el host
      if (room.hostId !== user.sub) {
        return {
          success: false,
          message: 'Only the host can assign teams',
        };
      }

      // Obtener o crear el juego para esta sala
      const game = await this.getOrCreateGame(room.id, data.roomCode);

      if (!game) {
        throw new Error('Failed to create or retrieve game');
      }

      // Asignar equipos manualmente
      await this.gamesService.assignTeamsManually(
        game.id,
        data.team1UserIds,
        data.team2UserIds,
      );

      this.logger.log(
        `Teams assigned manually in room ${data.roomCode} by ${user.username}`,
      );

      // Obtener participantes con equipos actualizados
      const participants = await this.gamesService.getParticipantsWithTeams(game.id);

      // Broadcast a todos en la sala
      server.to(data.roomCode).emit('teams_assigned', {
        gameId: game.id,
        participants: participants.map(p => ({
          userId: p.userId,
          username: p.user.username,
          teamId: p.teamId,
          teamNumber: p.team?.teamNumber,
          teamName: p.team?.name,
        })),
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Teams assigned successfully',
      };
    } catch (error) {
      this.logger.error(
        `Error assigning teams: ${error.message}`,
      );

      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Asigna equipos de forma aleatoria
   */
  async handleAssignTeamsRandom(
    client: Socket,
    data: AssignTeamsRandomData,
    server: Server,
  ): Promise<TeamAssignmentResponse> {
    const user = client.data.user;

    try {
      // Verificar que la sala existe
      const room = await this.roomsService.findByRoomCode(data.roomCode);

      // Validar que el usuario es el host
      if (room.hostId !== user.sub) {
        return {
          success: false,
          message: 'Only the host can assign teams',
        };
      }

      // Obtener o crear el juego para esta sala
      const game = await this.getOrCreateGame(room.id, data.roomCode);

      if (!game) {
        throw new Error('Failed to create or retrieve game');
      }

      // Asignar equipos aleatoriamente
      await this.gamesService.assignTeamsRandomly(game.id);

      this.logger.log(
        `Teams assigned randomly in room ${data.roomCode} by ${user.username}`,
      );

      // Obtener participantes con equipos actualizados
      const participants = await this.gamesService.getParticipantsWithTeams(game.id);

      // Broadcast a todos en la sala
      server.to(data.roomCode).emit('teams_assigned', {
        gameId: game.id,
        participants: participants.map(p => ({
          userId: p.userId,
          username: p.user.username,
          teamId: p.teamId,
          teamNumber: p.team?.teamNumber,
          teamName: p.team?.name,
        })),
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: 'Teams assigned randomly',
      };
    } catch (error) {
      this.logger.error(
        `Error assigning teams randomly: ${error.message}`,
      );

      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Obtiene un juego existente o crea uno nuevo para la sala
   */
  private async getOrCreateGame(roomId: string, roomCode: string) {
    let game = await this.gamesService.getGameByRoomId(roomId);

    if (!game) {
      // Si no existe juego, crearlo
      game = await this.gamesService.createGame(roomId);

      // Agregar participantes
      const connectedPlayers = this.gamesService.getConnectedPlayers(roomCode);
      for (let i = 0; i < connectedPlayers.length; i++) {
        await this.gamesService.addParticipant(game.id, connectedPlayers[i], i + 1);
      }

      // Recargar game con participantes
      game = await this.gamesService.getGameByRoomId(roomId);
    }

    return game;
  }
}
