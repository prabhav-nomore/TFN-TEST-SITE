import { Server, Socket } from 'socket.io';
import { readDB } from './db.js';

let ioInstance: Server;

export function setupSocket(io: Server) {
  ioInstance = io;

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_admin', () => {
      socket.join('admin');
      console.log('Admin joined');
    });

    socket.on('join_team', (teamId: string) => {
      socket.join(`team_${teamId}`);
      console.log(`Team ${teamId} joined`);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
}

export function notifyAdmin(event: string, data: any) {
  if (ioInstance) {
    ioInstance.to('admin').emit(event, data);
  }
}

export function notifyTeam(teamId: string, event: string, data: any) {
  if (ioInstance) {
    ioInstance.to(`team_${teamId}`).emit(event, data);
  }
}
