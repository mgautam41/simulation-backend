/**
 * content.js — Static content pools used during simulation.
 * Captions, comments, bios, locations, etc. mirror the original seed data.
 */

export const CAPTIONS = [
  "Golden hour never disappoints 🌅",
  "Some days you just have to create your own sunshine ☀️",
  "Not all those who wander are lost 🌍",
  "Good food + good company = perfect evening 🍽️",
  "Sunset therapy is the best therapy 🌇",
  "Chasing light and living in the moment 📸",
  "The mountains are calling and I must go 🏔️",
  "This view though 😍",
  "Late nights, city lights 🌃",
  "Feeling grateful for everything today 🙏",
  "Plot twist: this is exactly where I'm supposed to be",
  "A little bit of magic in everyday life ✨",
  "It's a vibe, not just a photo 🔥",
  "Started from the bottom now we here 📈",
  "Just breathe and let things unfold 🍃",
  "Creating memories one photo at a time",
  "Weekends were made for adventures 🏕️",
  "Found paradise 🌊",
  "The best is yet to come 🚀",
  "Slow mornings are a luxury I finally allow myself ☁️",
  "Energy doesn't lie. Trust the vibes 💫",
  "Be the kind of person you needed when you were younger 🌱",
  "Adventure is out there, go find it 🗺️",
  "One step at a time, one day at a time 🚶",
  "This moment deserves to be remembered 🎞️",
];

export const COMMENTS = [
  "This is absolutely stunning! 😍",
  "Wow love this so much ❤️",
  "Goals honestly 🔥",
  "This made my day!",
  "Incredible shot 📸",
  "Living for this content 🙌",
  "You always post the best stuff!",
  "This deserves way more likes",
  "I felt this one fr 💫",
  "The lighting is perfect!",
  "Adding this to my bucket list immediately",
  "Never stop posting please 🙏",
  "Okay now I'm jealous 😭",
  "Your feed is so clean omg",
  "Actual magic ✨",
  "Caption + photo combo is elite",
  "Big mood honestly",
  "This speaks to my soul",
  "Simply gorgeous 🌸",
  "Hard to pick a favourite but this might be it",
  "Where is this?? I NEED to go",
  "You make everything look so easy 🏆",
  "The colours in this are unreal 🎨",
  "Okay this just healed me a little 🫶",
  "Showing up for myself by saving this 🔖",
];

export const LOCATIONS = [
  "Mumbai, India",
  "Delhi, India",
  "Bangalore, India",
  "Hyderabad, India",
  "Chennai, India",
  "Pune, India",
  "Goa, India",
  "Jaipur, India",
  "Rajkot, India",
  "Manali, India",
  "Rishikesh, India",
  "Udaipur, India",
  "Ahmedabad, India",
  "Kolkata, India",
  "Lucknow, India",
];

// Picsum photo seeds for random images (each gives a stable unique photo)
export const PHOTO_SEEDS = Array.from({ length: 200 }, (_, i) => `snaplink_sim_${i + 1}`);
