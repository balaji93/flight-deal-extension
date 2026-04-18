# ✈️ India Flight Deal Finder — Assignment 2

> **Demo Video (Assignment 2):** https://youtu.be/XeMO0i8oerU

---

## 📌 What's New in Assignment 2

This assignment extends the Chrome Extension built in Assignment 1 by integrating **Google Gemini API** to generate personalised travel itineraries for the user's destination. A new **tabbed results interface** was introduced so flight deals and AI itineraries coexist cleanly in the side panel.

---

## ✨ Features Added

### 1. AI Itinerary Generation (Gemini API)

**When the Itinerary tab is clicked** (not on search — lazy load), the extension:

1. Shows an animated loader:  
   `✦` pulsing star inside a rotating gradient ring + label **"Generating AI recommended tour itinerary…"**
2. Sends a structured prompt to the **Gemini 2.5 Flash** model via the REST API.
3. Parses the response and renders **day-wise plan cards** with colour-coded time chips.

**Response is cached** — switching tabs repeatedly does not re-call Gemini. Cache resets on each new search.

---

### 2. PEACE-Principle Prompt Design

The prompt sent to Gemini follows the **PEACE** framework:

| Principle | Applied as |
|---|---|
| **P**urpose | "Concise travel assistant for a compact Chrome extension sidepanel" |
| **E**xplicit context | Route, dates, number of days, cheapest flight landing time, return flight departure time |
| **A**udience | Indian traveller, moderate budget |
| **C**oncise output | Strict 500-token cap, no prose, day-wise bullet format only, max 12 words per bullet |
| **E**xample | A fully-formatted Day 1 example is shown in the prompt so Gemini mirrors the structure |

**Itinerary intelligence:**
- **Day 1** starts ~90 min after cheapest outbound flight lands (airport transit + check-in buffer)
- **Last day** ends 2 hours before the return flight departs (airport transit buffer)
- **One-way trip** → defaults to a **2-day itinerary**

---

### 3. Secure API Key Handling

The Gemini API key is **never committed to git**.

| File | Purpose | In git? |
|---|---|---|
| `src/config.js` | Holds the real API key | ❌ gitignored |
| `src/config.js.example` | Placeholder to guide setup | ✅ committed |
| `.gitignore` | Excludes `src/config.js` | ✅ committed |

To set up locally:
```bash
cp src/config.js.example src/config.js
# Edit src/config.js and add your Gemini API key
```

Get a key at: https://aistudio.google.com/app/apikey

---


