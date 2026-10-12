import {definePost} from "@perxel/social-kit"

export default definePost({
    template: "hello-reel",
    props: {words: ["One", "post,", "every", "size."], bpm: 120},
})
