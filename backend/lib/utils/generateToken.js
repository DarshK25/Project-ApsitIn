import jwt from "jsonwebtoken";
export const generateTokenAndSetCookie = async (userId, res) => {
    try {
        const token = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "15d" });
        console.log("Generated JWT:", token); 
        await res.cookie("jwt-apsitin", token, {
            httpOnly: true,
            maxAge: 15 * 24 * 60 * 60 * 1000,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "development",
        });
    } catch (err) {
        console.log("Error in generateTokenAndSetCookie:", err);
        throw new Error("Error generating token and setting cookie");
    }
};
