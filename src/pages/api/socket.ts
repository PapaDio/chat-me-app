import { NextApiRequest } from 'next'
import { Server as ServerIO } from 'socket.io'
import { Server as NetServer } from 'http'
import { NextApiResponseServerIO } from '@/lib/socket'
import { initializeSocket } from '@/lib/socket'

export default function SocketHandler(req: NextApiRequest, res: NextApiResponseServerIO) {
  if (res.socket.server.io) {
    console.log('Socket.IO already running')
  } else {
    console.log('Socket.IO is initializing')
    const io = initializeSocket(res.socket.server)
    res.socket.server.io = io
  }
  res.end()
}
