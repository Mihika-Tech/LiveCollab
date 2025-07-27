import { io } from "socket.io-client";

const URL = "http://localhost:4000"; // backend server

// Function to create socket connection with authentication
export const createAuthenticatedSocket = () => {
    const token = localStorage.getItem("token");
    
    return io(URL, {
        autoConnect: false,
        auth: {
            token: token
        }
    });
};

// Export a default socket (will be recreated with auth when needed)
export const socket = createAuthenticatedSocket();