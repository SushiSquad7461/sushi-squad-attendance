/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js,ts}", "./index.html"],
  theme: {
    extend: {
      colors: {
        "sushi-blue": "#56CBF9",
        "sushi-pink": "rgb(255, 114, 159)"
      }
    },
  },
  plugins: [],
}