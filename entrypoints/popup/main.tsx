import React from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

createRoot(rootElement).render(
	<React.StrictMode>
		<ChakraProvider>
			<App />
		</ChakraProvider>
	</React.StrictMode>
);
