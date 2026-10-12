import {defineConfig} from "@perxel/social-kit"

// A neutral sample brand. Paths are relative to this folder.
export default defineConfig({
    brand: {
        name: "Example",
        url: "example.com",
        logo: {dark: "assets/logos/example-white.svg"},
        colors: {primary: "#1f2a44", deep: "#0a1022", ink: "#ffffff"},
    },
    defaults: {still: ["square", "landscape"]},
})
