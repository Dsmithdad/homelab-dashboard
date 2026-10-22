import React, { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';

// Skeeter's hover easter eggs: a small jab pops up on roughly 1 in CHANCE hovers.
// One listener on the document does all the work, so no page needs editing.

export const HOVER_JABS_KEY = 'hoverJabsEnabled';
export const HOVER_JABS_EVENT = 'hover-jabs-changed';

const CHANCE = 3;      // about 1 in 3 hovers
const DELAY_MS = 450;  // must hover this long first
const SHOW_MS = 2200;  // how long the bubble stays

// hover targets: buttons, links, sidebar items, and tile titles
const TARGETS = 'button, a, [role="button"], .MuiListItemButton-root, .MuiTypography-overline';

const JABS = [
  "Don't touch~Skeet",
  'Whoa there Rival',
  'Here you go messing with stuff again',
  'Easy Cowboy',
  'Hands off, I was about to click that.',
  'Bold move, slowpoke.',
  'Careful, that one bites.',
  'Oh, we are clicking things now?',
  'Look at you, exploring!',
  'I saw that. I see everything.',
  'Is that your final answer?',
  'You hover like you code: hesitantly.',
  'Go on, press it. I dare you.',
  'Nothing to see here. Move along.',
  'Your cursor has trust issues.',
  'Spoiler: it works.',
  'Ooh, curious. Rude, but curious.',
  'That button has feelings, you know.',
  'Think you can handle it?',
  'Back for more, huh?',
  'Rival, please. Use your words.',
  'Click it and find out.',
  'You missed a spot. Kidding. Maybe.',
  'Nice aim. For a beginner.',
  'Plot twist: I hover back.',
  'Do not make me log this.',
  'Try that on hard mode.',
  'Smooth moves, keyboard warrior.',
  'I would not, but you will.',
  'Another day, another poke.',
  'Fine, you win this one.',
  'Is it a bug or is it you?',
  'Hover tax: one compliment. You look great.',
  'Skeeter approves. Barely.',
  'Cursor spotted. Engaging sass.',
  'Ten points for style.',
  'Eyes up, builder.',
  'You again?',
  'This is my dashboard too, you know.',
  'Keep that up and I will start charging rent.',
];

// shuffled deck: every jab shows once before any repeats
let deck = [];
const nextJab = () => {
  if (deck.length === 0) {
    deck = [...JABS];
    for (let i = deck.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  return deck.pop();
};

export const hoverJabsEnabled = () => {
  try { return localStorage.getItem(HOVER_JABS_KEY) !== 'false'; } catch (e) { return true; }
};

// true when the element (or a close parent) already has its own tooltip or label, so we never override it
const hasOwnTooltip = (el) => {
  for (let n = el, i = 0; n && i < 3; n = n.parentElement, i += 1) {
    if (n.getAttribute && (n.getAttribute('title') || n.getAttribute('aria-label') || n.getAttribute('data-mui-internal-clone-element'))) return true;
  }
  return false;
};

export default function HoverJabs() {
  const [bubble, setBubble] = useState(null);
  const enabled = useRef(hoverJabsEnabled());
  const showTimer = useRef(null);
  const hideTimer = useRef(null);
  const current = useRef(null);

  useEffect(() => {
    const clear = () => {
      clearTimeout(showTimer.current);
      current.current = null;
      setBubble(null);
    };
    const onOver = (e) => {
      if (!enabled.current || !(e.target instanceof Element)) return;
      const el = e.target.closest(TARGETS);
      if (!el || el === current.current) return;
      clear();
      current.current = el;
      if (hasOwnTooltip(el) || Math.floor(Math.random() * CHANCE) !== 0) return;
      showTimer.current = setTimeout(() => {
        const r = el.getBoundingClientRect();
        setBubble({ text: nextJab(), x: r.left + r.width / 2, y: r.top });
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setBubble(null), SHOW_MS);
      }, DELAY_MS);
    };
    const onOut = (e) => {
      if (current.current && !current.current.contains(e.relatedTarget)) clear();
    };
    const onToggle = () => { enabled.current = hoverJabsEnabled(); if (!enabled.current) clear(); };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mousedown', clear);
    window.addEventListener(HOVER_JABS_EVENT, onToggle);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mousedown', clear);
      window.removeEventListener(HOVER_JABS_EVENT, onToggle);
      clearTimeout(showTimer.current);
      clearTimeout(hideTimer.current);
    };
  }, []);

  if (!bubble) return null;
  return (
    <Box
      role="presentation"
      sx={(t) => ({
        position: 'fixed', zIndex: t.zIndex.tooltip + 1, pointerEvents: 'none',
        left: Math.min(Math.max(bubble.x, 90), window.innerWidth - 90), top: Math.max(bubble.y - 8, 28),
        transform: 'translate(-50%, -100%)', maxWidth: 220, textAlign: 'center',
        px: 1.25, py: 0.5, borderRadius: 1, fontSize: 12, fontStyle: 'italic',
        color: t.palette.text.primary, bgcolor: alpha(t.palette.background.paper, 0.95),
        border: `1px solid ${alpha(t.palette.primary.main, 0.6)}`,
        boxShadow: `0 0 10px ${alpha(t.palette.primary.main, 0.35)}`,
      })}
    >
      {bubble.text}
    </Box>
  );
}
