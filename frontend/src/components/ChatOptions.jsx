import { useState } from 'react';
import { MoreVertical, BellOff, Flag, Ban, Trash2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const ChatOptions = ({ selectedUser, onClose }) => {
    const [isMuted, setIsMuted] = useState(false);

    const handleMuteToggle = async () => {
        try {
            await axios.post(
                `http://localhost:3000/api/v1/messages/mute/${selectedUser._id}`,
                { muted: !isMuted },
                { withCredentials: true }
            );
            setIsMuted(!isMuted);
            toast.success(isMuted ? 'Chat unmuted' : 'Chat muted');
        } catch (error) {
            console.error('Failed to toggle mute:', error);
            toast.error('Failed to update mute settings');
        }
    };

    const handleReport = async () => {
        try {
            await axios.post(
                `http://localhost:3000/api/v1/messages/report/${selectedUser._id}`,
                {},
                { withCredentials: true }
            );
            toast.success('User reported successfully');
            onClose();
        } catch (error) {
            console.error('Failed to report user:', error);
            toast.error('Failed to report user');
        }
    };

    const handleBlock = async () => {
        try {
            await axios.post(
                `http://localhost:3000/api/v1/messages/block/${selectedUser._id}`,
                {},
                { withCredentials: true }
            );
            toast.success('User blocked successfully');
            onClose();
        } catch (error) {
            console.error('Failed to block user:', error);
            toast.error('Failed to block user');
        }
    };

    const handleDeleteChat = async () => {
        try {
            await axios.delete(
                `http://localhost:3000/api/v1/messages/chat/${selectedUser._id}`,
                { withCredentials: true }
            );
            toast.success('Chat deleted successfully');
            onClose();
        } catch (error) {
            console.error('Failed to delete chat:', error);
            toast.error('Failed to delete chat');
        }
    };

    return (
        <div className="absolute right-0 top-16 w-48 bg-white rounded-lg shadow-lg py-2 z-50">
            <div className="px-4 py-2 border-b border-gray-100">
                <h3 className="font-medium text-gray-900">Details</h3>
            </div>
            
            <button
                onClick={handleMuteToggle}
                className="w-full px-4 py-2 flex items-center space-x-3 hover:bg-gray-50 transition-colors"
            >
                <BellOff className="w-5 h-5 text-gray-500" />
                <span className="text-gray-700">{isMuted ? 'Unmute messages' : 'Mute messages'}</span>
            </button>

            <button
                onClick={handleReport}
                className="w-full px-4 py-2 flex items-center space-x-3 hover:bg-gray-50 transition-colors text-red-600"
            >
                <Flag className="w-5 h-5" />
                <span>Report</span>
            </button>

            <button
                onClick={handleBlock}
                className="w-full px-4 py-2 flex items-center space-x-3 hover:bg-gray-50 transition-colors text-red-600"
            >
                <Ban className="w-5 h-5" />
                <span>Block</span>
            </button>

            <button
                onClick={handleDeleteChat}
                className="w-full px-4 py-2 flex items-center space-x-3 hover:bg-gray-50 transition-colors text-red-600"
            >
                <Trash2 className="w-5 h-5" />
                <span>Delete Chat</span>
            </button>
        </div>
    );
};

export default ChatOptions; 