import {definePost} from "@perxel/social-kit"

export default definePost({
    template: "announcement",
    formats: ["square", "landscape", "portrait"],
    props: {
        headline: "One post,\n**every size**,\nfrom one source.",
    },
})
