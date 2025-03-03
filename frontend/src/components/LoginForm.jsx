import { useState } from "react";
import { Loader } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const LoginForm = () => {
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const { login } = useAuth();

	const handleSubmit = async (e) => {
		e.preventDefault();
		setIsLoading(true);
		try {
			await login(username, password);
		} catch (error) {
			console.error("Login error:", error);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4 w-full max-w-md">
			<input
				type="text"
				placeholder="Username"
				value={username}
				onChange={(e) => setUsername(e.target.value)}
				className="input input-bordered w-full"
				required
			/>
			<input
				type="password"
				placeholder="Password"
				value={password}
				onChange={(e) => setPassword(e.target.value)}
				className="input input-bordered w-full"
				required
			/>

			<button type="submit" className="btn btn-primary w-full" disabled={isLoading}>
				{isLoading ? <Loader className="size-5 animate-spin" /> : "Login"}
			</button>
		</form>
	);
};

export default LoginForm;
