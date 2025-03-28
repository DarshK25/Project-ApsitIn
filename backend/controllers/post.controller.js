import Post from "../models/post.model.js";
import cloudinary from "../lib/cloudinary.js";
import Notification from "../models/notification.model.js" 
import fs from 'fs/promises';
import User from "../models/user.model.js";
import Comment from "../models/comment.model.js";

export const getFeedPosts = async (req, res) => {
    try {
        // First, cleanup any orphaned comments
        await cleanupOrphanedComments();

        console.log("Fetching feed posts for user:", req.user._id);

        const posts = await Post.find({
            $or: [
                { author: { $in: req.user.connections } }, // Posts from connections
                { author: req.user._id },                 // Posts by the current user
            ],
        })
        .populate("author", "name username profilePicture headline")
        .populate({
            path: "comments",
            populate: [
                {
                    path: "author",
                    select: "name username profilePicture headline",
                    model: "User"
                },
                {
                    path: "replies",
                    populate: {
                        path: "author",
                        select: "name username profilePicture headline",
                        model: "User"
                    }
                }
            ]
        })
        .sort({ createdAt: -1 });

        console.log("Found posts:", posts.length);
        
        // For debugging, log the first post's comments
        if (posts.length > 0) {
            console.log("First post comments:", posts[0].comments);
            
            // Check if the first post has comments with replies
            if (posts[0].comments && posts[0].comments.length > 0) {
                console.log("First comment replies:", posts[0].comments[0].replies);
            }
        }

        // Transform posts to include liked status
        const transformedPosts = posts.map(post => {
            const postObj = post.toObject();
            
            // Ensure comments is an array
            const comments = Array.isArray(postObj.comments) ? postObj.comments : [];
            
            console.log(`Post ${post._id} has ${comments.length} comments`);
            
            return {
                ...postObj,
                likes: Array.isArray(post.likes) ? post.likes.length : 0,
                liked: Array.isArray(post.likes) ? post.likes.includes(req.user._id) : false,
                comments: comments.map(comment => {
                    // Skip comments with invalid/deleted authors
                    if (!comment || !comment.author) {
                        console.log("Skipping comment with missing author:", comment?._id);
                        return null;
                    }
                    
                    // Ensure replies is an array
                    const replies = Array.isArray(comment.replies) ? comment.replies : [];
                    
                    console.log(`Comment ${comment._id} has ${replies.length} replies`);
                    
                    return {
                        ...comment,
                        likes: Array.isArray(comment.likes) ? comment.likes.length : 0,
                        liked: Array.isArray(comment.likes) ? comment.likes.includes(req.user._id) : false,
                        replies: replies.map(reply => {
                            if (!reply || !reply.author) {
                                console.log("Skipping reply with missing author:", reply?._id);
                                return null;
                            }
                            
                            return {
                                ...reply,
                                likes: Array.isArray(reply.likes) ? reply.likes.length : 0,
                                liked: Array.isArray(reply.likes) ? reply.likes.includes(req.user._id) : false
                            };
                        }).filter(Boolean)
                    };
                }).filter(Boolean) // Remove null comments
            };
        });

        console.log("Transformed posts:", transformedPosts.length);

        res.status(200).json({ 
            success: true, 
            posts: transformedPosts
        });
    } catch (error) {
        console.error("Error in getFeedPosts: ", error);
        res.status(500).json({ 
            success: false, 
            message: error.message || "Failed to fetch posts",
            posts: []
        });
    }
}

export const createPost = async (req, res) => {
    try {
        const { content } = req.body;
        const userId = req.user._id;
        
        if (!content && !req.file) {
            return res.status(400).json({ 
                success: false, 
                message: "Post must contain either text content or an image" 
            });
        }

        // Create the post
        const post = new Post({
            author: userId,
            content: content || "",
            likes: [],
            comments: []
        });

        // Handle image upload if present
        if (req.file) {
            try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: 'posts',
                    resource_type: 'auto'
                });
                post.image = result.secure_url;
                // Clean up the local file after successful upload
                await fs.unlink(req.file.path);
            } catch (uploadError) {
                console.error("Error uploading to Cloudinary:", uploadError);
                // Clean up the local file if upload fails
                if (req.file) {
                    try {
                        await fs.unlink(req.file.path);
                    } catch (unlinkError) {
                        console.error("Error deleting local file:", unlinkError);
                    }
                }
                return res.status(500).json({ 
                    success: false, 
                    message: "Error uploading image. Please try again." 
                });
            }
        }

        // Save the post
        await post.save();

        try {
            // Populate the post with author details
            const populatedPost = await Post.findById(post._id)
                .populate("author", "name username profilePicture headline");

            if (!populatedPost) {
                throw new Error("Failed to retrieve created post");
            }

            const transformedPost = {
                ...populatedPost.toObject(),
                likes: 0,
                liked: false,
                comments: []
            };

            // Create notifications for connections
            try {
                const user = await User.findById(userId).select("name connections");
                if (user?.connections?.length > 0) {
                    await Promise.all(user.connections.map(connectionId => 
                        Notification.create({
                            recipient: connectionId,
                            sender: userId,
                            type: "post",
                            message: `${user.name} shared a new post`,
                            post: post._id
                        }).catch(error => {
                            console.error("Error creating notification:", error);
                            return null; // Continue even if notification fails
                        })
                    ));
                }
            } catch (notificationError) {
                console.error("Error handling notifications:", notificationError);
                // Continue even if notifications fail
            }

            return res.status(201).json({ success: true, post: transformedPost });
        } catch (populateError) {
            console.error("Error after post creation:", populateError);
            return res.status(201).json({ 
                success: true, 
                post: { ...post.toObject(), likes: 0, liked: false, comments: [] }
            });
        }
    } catch (error) {
        console.error("Error in createPost:", error);
        // Clean up uploaded file if it exists
        if (req.file) {
            await fs.unlink(req.file.path).catch(console.error);
        }
        return res.status(500).json({ 
            success: false, 
            message: error.message || "Failed to create post" 
        });
    }
};

export const getPostById = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id)
        .populate("author", "name username profilePicture headline")
            .populate({
                path: "comments",
                populate: [
                    {
                        path: "author",
                        select: "name username profilePicture"
                    },
                    {
                        path: "replies",
                        match: { parentComment: { $exists: true } },
                        populate: {
                            path: "author",
                            select: "name username profilePicture"
                        }
                    }
                ]
            });

        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        // Transform the post for response
        const transformedPost = {
            ...post.toObject(),
            likes: Array.isArray(post.likes) ? post.likes.length : 0,
            liked: Array.isArray(post.likes) ? post.likes.includes(req.user._id) : false,
            comments: Array.isArray(post.comments) ? post.comments.map(comment => ({
                ...comment,
                likes: Array.isArray(comment.likes) ? comment.likes.length : 0,
                liked: Array.isArray(comment.likes) ? comment.likes.includes(req.user._id) : false,
                replies: Array.isArray(comment.replies) ? comment.replies.map(reply => ({
                    ...reply,
                    likes: Array.isArray(reply.likes) ? reply.likes.length : 0,
                    liked: Array.isArray(reply.likes) ? reply.likes.includes(req.user._id) : false
                })) : []
            })) : []
        };

        res.status(200).json({ success: true, post: transformedPost });
    } catch (error) {
        console.error("Error in getPost: ", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}

export const updatePost = async (req, res) => {
    try {
        // First find the post and check authorization
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }
        
        if (post.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "You are not authorized to update this post" });
        }

        // Update content if provided
        if (req.body.content !== undefined) {
            post.content = req.body.content.trim();
        }

        // Handle image update if file is provided
        if (req.file) {
            try {
                if (post.image) {
                    // Delete old image
                    const publicId = post.image.split("/").pop().split(".")[0];
                    await cloudinary.uploader.destroy(publicId);
                }
                // Upload new image
                const result = await cloudinary.uploader.upload(req.file.path);
                post.image = result.secure_url;
                // Clean up uploaded file
                await fs.unlink(req.file.path);
            } catch (error) {
                console.error("Error handling image:", error);
                return res.status(500).json({ success: false, message: "Error updating image" });
            }
        }

        // Handle image removal
        if (req.body.removeImage === 'true' && post.image) {
            try {
                const publicId = post.image.split("/").pop().split(".")[0];
                await cloudinary.uploader.destroy(publicId);
                post.image = null;
            } catch (error) {
                console.error("Error removing image:", error);
            }
        }

        // Save the updated post
        await post.save();

        // Fetch fresh post with populated fields
        const updatedPost = await Post.findById(post._id)
            .populate("author", "name username profilePicture headline")
            .populate({
                path: "comments",
                        populate: {
                            path: "author",
                            select: "name username profilePicture"
                        }
            });

        // Transform the post for response
        const transformedPost = {
            ...updatedPost.toObject(),
            likes: updatedPost.likes.length,
            liked: updatedPost.likes.includes(req.user._id),
            comments: updatedPost.comments.map(comment => ({
                ...comment,
                likes: comment.likes.length,
                liked: comment.likes.includes(req.user._id),
                replies: comment.replies?.map(reply => ({
                    ...reply,
                    likes: reply.likes.length,
                    liked: reply.likes.includes(req.user._id)
                }))
            }))
        };

        // Send success response
        res.status(200).json({
            success: true,
            message: "Post updated successfully",
            post: transformedPost
        });

    } catch (error) {
        console.error("Error in updatePost:", error);
        // Clean up uploaded file if exists
        if (req.file) {
            try {
                await fs.unlink(req.file.path);
            } catch (unlinkError) {
                console.error("Error deleting uploaded file:", unlinkError);
            }
        }
        res.status(500).json({ success: false, message: "Server error" });
    }
}

export const deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }
        
        if (post.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "You are not authorized to delete this post" });
        }

        // Delete image from cloudinary if exists
        if (post.image) {
            try {
                const publicId = post.image.split("/").pop().split(".")[0];
                await cloudinary.uploader.destroy(publicId);
            } catch (cloudinaryError) {
                console.error("Error deleting image from Cloudinary:", cloudinaryError);
                // Continue with post deletion even if image deletion fails
            }
        }

        // Delete all comments and their replies associated with the post
        await Comment.deleteMany({ 
            $or: [
                { post: post._id },
                { post: post._id, parentComment: { $exists: true } }
            ]
        });

        // Delete all notifications related to this post
        await Notification.deleteMany({ post: post._id });

        // Delete the post
        await Post.findByIdAndDelete(post._id);

        res.status(200).json({
            success: true,
            message: "Post and all associated data deleted successfully",
            deletedPostId: post._id
        });
    } catch (error) {
        console.error("Error in deletePost: ", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
}

export const likePost = async (req, res) => {
    try {
        const postId = req.params.id;
        const userId = req.user._id;

        const post = await Post.findById(postId).populate("author", "name");
        if (!post) {
            return res.status(404).json({ success: false, message: "Post not found" });
        }

        // Check if user has already liked the post
        const isLiked = post.likes.includes(userId);
        
        // Toggle like status
        if (isLiked) {
            // Unlike: Remove user from likes array
            post.likes = post.likes.filter(id => id.toString() !== userId.toString());
        } else {
            // Like: Add user to likes array
            post.likes.push(userId);
            
            // Create notification for post owner if it's not their own post
            if (post.author._id.toString() !== userId.toString()) {
                const user = await User.findById(userId).select("name");
                if (user) {
                    await Notification.create({
                        recipient: post.author._id,
                        sender: userId,
                        type: "like",
                        message: `${user.name} liked your post`,
                        post: postId
                    });
                }
            }
        }

        // Save the updated post
        await post.save();

        // Fetch the updated post with all necessary fields
        const updatedPost = await Post.findById(postId)
            .populate("author", "name username profilePicture headline")
            .populate({
                path: "comments",
                populate: [
                    {
                        path: "author",
                        select: "name username profilePicture headline",
                        model: "User"
                    },
                    {
                        path: "replies",
                        populate: {
                            path: "author",
                            select: "name username profilePicture headline",
                            model: "User"
                        }
                    }
                ]
            });

        if (!updatedPost) {
            return res.status(404).json({ success: false, message: "Post not found after update" });
        }

        // Transform the post data
        const transformedPost = {
            ...updatedPost.toObject(),
            likes: updatedPost.likes.length,
            liked: updatedPost.likes.includes(userId),
            comments: Array.isArray(updatedPost.comments) ? updatedPost.comments.map(comment => ({
                ...comment,
                likes: Array.isArray(comment.likes) ? comment.likes.length : 0,
                liked: Array.isArray(comment.likes) ? comment.likes.includes(userId) : false,
                replies: Array.isArray(comment.replies) ? comment.replies.map(reply => ({
                    ...reply,
                    likes: Array.isArray(reply.likes) ? reply.likes.length : 0,
                    liked: Array.isArray(reply.likes) ? reply.likes.includes(userId) : false
                })) : []
            })) : []
        };

        return res.json({ 
            success: true, 
            post: transformedPost
        });
    } catch (error) {
        console.error("Error in likePost:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message || "Failed to process like" 
        });
    }
};

export const addComment = async (req, res) => {
    try {
        const { content } = req.body;
        const postId = req.params.id;
        const { parentCommentId } = req.body; // Optional, for replies
        const userId = req.user._id;

        console.log("Adding comment to post:", postId, "Content:", content, "User:", userId);

        // Validate content
        if (!content || !content.trim()) {
            return res.status(400).json({
                success: false,
                message: "Comment content is required"
            });
        }

        // Check if post exists
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found"
            });
        }

        // Create the comment
        const comment = new Comment({
            content: content.trim(),
            author: userId,
            post: postId,
            parentComment: parentCommentId || null
        });

        // Save the comment
        await comment.save();
        console.log("Comment created:", comment._id);

        // If this is a reply, update the parent comment's replyCount
        if (parentCommentId) {
            await Comment.findByIdAndUpdate(parentCommentId, {
                $inc: { replyCount: 1 }
            });
            console.log("Updated parent comment replyCount");
        }

        // Add comment to post's comments array
        post.comments.push(comment._id);
        await post.save();
        console.log("Added comment to post");

        // Create notification for post author if it's not their own comment
        if (post.author.toString() !== userId.toString()) {
            const user = await User.findById(userId).select("name");
            if (user) {
                await Notification.create({
                    recipient: post.author,
                    sender: userId,
                    type: "comment",
                    message: `${user.name} commented on your post`,
                    post: postId
                });
                console.log("Created notification for post author");
            }
        }

        // Fetch the updated post with populated fields
        const updatedPost = await Post.findById(postId)
            .populate("author", "name username profilePicture headline")
            .populate({
                path: "comments",
                populate: [
                    {
                        path: "author",
                        select: "name username profilePicture headline",
                        model: "User"
                    },
                    {
                        path: "replies",
                        populate: {
                            path: "author",
                            select: "name username profilePicture headline",
                            model: "User"
                        }
                    }
                ]
            });

        if (!updatedPost) {
            return res.status(404).json({
                success: false,
                message: "Failed to fetch updated post"
            });
        }

        console.log("Fetched updated post with comments:", updatedPost.comments.length);

        // Transform the post for response
        const postObj = updatedPost.toObject();
        const comments = Array.isArray(postObj.comments) ? postObj.comments : [];
        
        console.log("Processing comments for response, count:", comments.length);
        
        const transformedPost = {
            ...postObj,
            likes: Array.isArray(updatedPost.likes) ? updatedPost.likes.length : 0,
            liked: Array.isArray(updatedPost.likes) ? updatedPost.likes.includes(userId) : false,
            comments: comments.map(comment => {
                // Skip comments with invalid/deleted authors
                if (!comment || !comment.author) {
                    console.log("Skipping comment with missing author:", comment?._id);
                    return null;
                }
                
                // Ensure replies is an array
                const replies = Array.isArray(comment.replies) ? comment.replies : [];
                
                console.log(`Comment ${comment._id} has ${replies.length} replies`);
                
                return {
                    ...comment,
                    likes: Array.isArray(comment.likes) ? comment.likes.length : 0,
                    liked: Array.isArray(comment.likes) ? comment.likes.includes(userId) : false,
                    replies: replies.map(reply => {
                        if (!reply || !reply.author) {
                            console.log("Skipping reply with missing author:", reply?._id);
                            return null;
                        }
                        
                        return {
                            ...reply,
                            likes: Array.isArray(reply.likes) ? reply.likes.length : 0,
                            liked: Array.isArray(reply.likes) ? reply.likes.includes(userId) : false
                        };
                    }).filter(Boolean)
                };
            }).filter(Boolean) // Remove null comments
        };

        console.log("Transformed post has comments:", transformedPost.comments.length);

        return res.status(201).json({
            success: true,
            post: transformedPost
        });
    } catch (error) {
        console.error("Error in addComment:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to add comment"
        });
    }
};

export const cleanupOrphanedComments = async () => {
    try {
        // Find all comments
        const comments = await Comment.find({});
        
        for (const comment of comments) {
            // Check if the associated post exists
            const postExists = await Post.exists({ _id: comment.post });
            if (!postExists) {
                // Delete the comment if its post doesn't exist
                await Comment.findByIdAndDelete(comment._id);
                console.log(`Deleted orphaned comment: ${comment._id}`);
            }
        }
        
        console.log('Orphaned comments cleanup completed');
    } catch (error) {
        console.error('Error cleaning up orphaned comments:', error);
    }
};