import { Server as NetServer } from 'http'
import { NextApiRequest, NextApiResponse } from 'next'
import { Server as ServerIO } from 'socket.io'
import { prisma } from './prisma'

export type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: NetServer & {
      io: ServerIO
    }
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
}

interface User {
  id: string
  username: string
  avatar?: string
}

interface SocketUser extends User {
  socketId: string
}

const connectedUsers = new Map<string, SocketUser>()

export function initializeSocket(server: NetServer) {
  const io = new ServerIO(server, {
    path: '/api/socket',
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  })

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id)

    // Handle user joining
    socket.on('user:join', async (userData: User) => {
      const socketUser: SocketUser = {
        ...userData,
        socketId: socket.id
      }
      
      connectedUsers.set(socket.id, socketUser)
      
      // Update user online status in database
      await prisma.user.update({
        where: { id: userData.id },
        data: { 
          isOnline: true,
          lastSeen: new Date()
        }
      })

      // Broadcast updated user list
      const users = Array.from(connectedUsers.values())
      io.emit('users:update', users)
      
      console.log(`User ${userData.username} joined`)
    })

    // Handle joining a room
    socket.on('room:join', (roomId: string) => {
      socket.join(roomId)
      console.log(`Socket ${socket.id} joined room ${roomId}`)
    })

    // Handle leaving a room
    socket.on('room:leave', (roomId: string) => {
      socket.leave(roomId)
      console.log(`Socket ${socket.id} left room ${roomId}`)
    })

    // Handle sending messages
    socket.on('message:send', async (data: {
      content: string
      roomId: string
      userId: string
      type: 'TEXT' | 'SYSTEM' | 'LLM_RESPONSE'
    }) => {
      try {
        // Save message to database
        const message = await prisma.message.create({
          data: {
            content: data.content,
            type: data.type,
            senderId: data.userId,
            roomId: data.roomId,
          },
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                avatar: true,
              }
            }
          }
        })

        // Broadcast message to room
        io.to(data.roomId).emit('message:receive', message)
        console.log(`Message sent to room ${data.roomId}`)
      } catch (error) {
        console.error('Error saving message:', error)
        socket.emit('error', 'Failed to send message')
      }
    })

    // Handle typing indicators
    socket.on('typing:start', (data: { roomId: string, username: string }) => {
      socket.to(data.roomId).emit('typing:start', data)
    })

    socket.on('typing:stop', (data: { roomId: string, username: string }) => {
      socket.to(data.roomId).emit('typing:stop', data)
    })

    // Handle disconnect
    socket.on('disconnect', async () => {
      const user = connectedUsers.get(socket.id)
      if (user) {
        // Update user offline status in database
        await prisma.user.update({
          where: { id: user.id },
          data: { 
            isOnline: false,
            lastSeen: new Date()
          }
        })

        connectedUsers.delete(socket.id)
        
        // Broadcast updated user list
        const users = Array.from(connectedUsers.values())
        io.emit('users:update', users)
        
        console.log(`User ${user.username} disconnected`)
      }
    })
  })

  return io
}
