import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1480px" } },
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        ui: ["var(--font-ui)"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          glow: "hsl(var(--primary-glow))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        table: {
          felt: "hsl(var(--table-felt))",
          edge: "hsl(var(--table-felt-edge))",
        },
        wood: {
          DEFAULT: "hsl(var(--wood-rim))",
          light: "hsl(var(--wood-rim-light))",
        },
        door: {
          DEFAULT: "hsl(var(--door))",
          foreground: "hsl(var(--door-foreground))",
        },
        treasure: {
          DEFAULT: "hsl(var(--treasure))",
          foreground: "hsl(var(--treasure-foreground))",
        },
        monster: {
          DEFAULT: "hsl(var(--monster))",
          foreground: "hsl(var(--monster-foreground))",
        },
        curse: {
          DEFAULT: "hsl(var(--curse))",
          foreground: "hsl(var(--curse-foreground))",
        },
        equip: {
          DEFAULT: "hsl(var(--equip))",
          foreground: "hsl(var(--equip-foreground))",
        },
        oneshot: {
          DEFAULT: "hsl(var(--oneshot))",
          foreground: "hsl(var(--oneshot-foreground))",
        },
        enhancer: {
          DEFAULT: "hsl(var(--enhancer))",
          foreground: "hsl(var(--enhancer-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      backgroundImage: {
        "gradient-felt": "var(--gradient-felt)",
        "gradient-wood": "var(--gradient-wood)",
        "gradient-brass": "var(--gradient-brass)",
        "gradient-parchment": "var(--gradient-parchment)",
        "gradient-monster": "var(--gradient-monster)",
        "gradient-curse": "var(--gradient-curse)",
        "gradient-treasure": "var(--gradient-treasure)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        "glow-brass": "var(--shadow-glow-brass)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "card-flip": { "0%": { transform: "rotateY(0)" }, "100%": { transform: "rotateY(180deg)" } },
        "draw-card": {
          "0%": { transform: "translateY(-40px) scale(0.7)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        "shake": {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-6px)" },
          "75%": { transform: "translateX(6px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "card-flip": "card-flip 0.6s ease-in-out",
        "draw-card": "draw-card 0.4s var(--ease-out-card)",
        "shake": "shake 0.4s ease-in-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
