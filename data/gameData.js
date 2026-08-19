/* ============================================================
   CYBER GRID :: GAME DATA
   Piece rosters, ranks, and the scenario card library.
   Shared by index.html (board) and admin.html (control panel)
   via a plain <script> include (no build step / bundler needed).
   ============================================================ */

// ----------------------------------------------------------------
// PIECE RANKS
// Higher number = higher rank. Classic Stratego-style hierarchy,
// re-skinned as a cyber org chart. Rank sets the BASE odds in a
// confrontation; the scenario card played then modifies that
// base via its `modifier`, and the admin makes the final call.
// ----------------------------------------------------------------

const RANK = {
  INTEL:     1,  // Scout-equivalent: fast, weak, great at recon
  ANALYST:   2,
  SYSADMIN:  3,
  ENGINEER:  4,
  RESPONDER: 5,
  SOC_LEAD:  6,
  CISO:      7,
  FIREWALL:  8,  // Bomb-equivalent (defenders only): kills most attackers, dies to EXPLOIT
  HONEYPOT:  9,  // Special trap piece (defenders only)
  SERVER:    0   // The Flag-equivalent objective (defenders only) — capture = game over
};

// ----------------------------------------------------------------
// DEFENDER (BLUE) ROSTER
// ----------------------------------------------------------------
const IT_BLUE_PIECES = [
  {
    id: "srv", name: "Critical Server", short: "SRV", rank: RANK.SERVER,
    count: 1, nature: "system", icon: "server", isObjective: true, movable: false,
    flavor: "The objective. If breached and not detected in time, the grid goes dark."
  },
  {
    id: "fw", name: "Firewall", short: "FW", rank: RANK.FIREWALL,
    count: 1, nature: "system", icon: "firewall", movable: true,
    flavor: "Stops nearly everything cold. Only a zero-day EXPLOIT gets through."
  },
  {
    id: "honeypot", name: "Honeypot", short: "HP", rank: RANK.HONEYPOT,
    count: 1, nature: "system", icon: "honeypot", movable: true, special: "trap",
    flavor: "Looks weak. Lures attackers in, then quietly identifies and traps them."
  },
  {
    id: "ciso", name: "CISO", short: "CISO", rank: RANK.CISO,
    count: 1, nature: "human", icon: "ciso", movable: true,
    flavor: "Top brass. Out-ranks almost every threat actor."
  },
  {
    id: "soc", name: "SOC Lead", short: "SOC", rank: RANK.SOC_LEAD,
    count: 1, nature: "human", icon: "soc", movable: true,
    flavor: "Runs the security operations center. Sharp eyes, sharp instincts."
  },
  {
    id: "responder", name: "Incident Responder", short: "IR", rank: RANK.RESPONDER,
    count: 2, nature: "human", icon: "responder", movable: true,
    flavor: "First on scene when something breaks."
  },
  {
    id: "engineer", name: "Security Engineer", short: "ENG", rank: RANK.ENGINEER,
    count: 1, nature: "human", icon: "engineer", movable: true,
    flavor: "Builds and hardens the defenses."
  },
  {
    id: "sysadmin", name: "Sysadmin", short: "SYS", rank: RANK.SYSADMIN,
    count: 1, nature: "human", icon: "sysadmin", movable: true,
    flavor: "Keeps the lights on. Patches, backups, access control."
  },
  {
    id: "analyst", name: "SOC Analyst", short: "AN", rank: RANK.ANALYST,
    count: 2, nature: "human", icon: "analyst", movable: true,
    flavor: "Tier-1 eyes on glass. Numerous, but easily overrun."
  },
  {
    id: "intel", name: "Threat Intel", short: "TI", rank: RANK.INTEL,
    count: 1, nature: "human", icon: "intel", movable: true, special: "recon",
    flavor: "Fast and weak, but can safely peek at an adjacent unrevealed piece."
  }
];

// ----------------------------------------------------------------
// ATTACKER (RED) ROSTER
// ----------------------------------------------------------------
const IT_RED_PIECES = [
  {
    id: "exploit", name: "Zero-Day Exploit", short: "0DAY", rank: RANK.FIREWALL + 1,
    count: 1, nature: "technical", icon: "exploit", movable: true, special: "firewall-killer",
    flavor: "The only thing in the game that beats a Firewall outright."
  },
  {
    id: "apt", name: "APT Operator", short: "APT", rank: RANK.CISO,
    count: 1, nature: "human", icon: "apt", movable: true,
    flavor: "Advanced Persistent Threat. Patient, skilled, dangerous to everyone but the top brass."
  },
  {
    id: "botmaster", name: "Botnet Master", short: "BOT", rank: RANK.SOC_LEAD,
    count: 1, nature: "human", icon: "botmaster", movable: true,
    flavor: "Commands distributed swarms. Hard to pin down."
  },
  {
    id: "ransomware", name: "Ransomware Op", short: "RW", rank: RANK.RESPONDER,
    count: 2, nature: "technical", icon: "ransomware", movable: true,
    flavor: "Encrypts, then negotiates. Brutal but not untouchable."
  },
  {
    id: "insider", name: "Insider Threat", short: "INS", rank: RANK.ENGINEER,
    count: 1, nature: "human", icon: "insider", movable: true, special: "disguise",
    flavor: "Already has legitimate access. Hard to distinguish from staff."
  },
  {
    id: "socialeng", name: "Social Engineer", short: "SE", rank: RANK.SYSADMIN,
    count: 1, nature: "human", icon: "socialeng", movable: true,
    flavor: "Talks their way past people, not firewalls."
  },
  {
    id: "phisher", name: "Phishing Crew", short: "PH", rank: RANK.ANALYST,
    count: 1, nature: "human", icon: "phisher", movable: true,
    flavor: "Casts a wide net. Numerous and disposable."
  },
  {
    id: "scanner", name: "Recon Scanner", short: "SCN", rank: RANK.INTEL,
    count: 2, nature: "technical", icon: "scanner", movable: true, special: "recon",
    flavor: "Fast, weak, built for mapping the attack surface before committing forces."
  }
];

// ================================================================
//  OT / ICS ROSTERS (Stage 3)
//  Same board math as IT (12 Blue / 10 Red, same deployment rows) so the
//  engine, quorum, and win-checks are unchanged. Counts are distributed to
//  reflect OT asset scarcity: a few irreplaceable systems, many operators.
//  Icons reuse the closest existing art; pieces marked customArt need
//  bespoke icons before customer sessions (tracked in the build notes).
// ================================================================
const OT_BLUE_PIECES = [
  {
    id: "plc", name: "PLC / RTU", short: "PLC", rank: RANK.SERVER,
    count: 1, nature: "system", icon: "server", isObjective: true, movable: false,
    customArt: true,
    flavor: "The objective. The controller running the physical process. Manipulate it and the process goes out of safe limits."
  },
  {
    id: "sis", name: "Safety Instrumented System", short: "SIS", rank: RANK.FIREWALL,
    count: 1, nature: "system", icon: "shield", movable: true, customArt: true,
    flavor: "The last line of physical safety. Stops nearly every attack cold — and can force a safe-state trip (Stage 4)."
  },
  {
    id: "ews", name: "Engineering Workstation", short: "EWS", rank: RANK.HONEYPOT,
    count: 1, nature: "system", icon: "firewall", movable: true, customArt: true,
    flavor: "The console used to program the PLC. High-value: lose it and the attacker can push logic changes far more easily."
  },
  {
    id: "otne", name: "OT Network Engineer", short: "OTNE", rank: RANK.CISO,
    count: 1, nature: "human", icon: "ciso", movable: true,
    flavor: "Segments and monitors the OT network. Out-ranks almost every threat actor."
  },
  {
    id: "cslead", name: "Control Systems Lead", short: "CSL", rank: RANK.SOC_LEAD,
    count: 1, nature: "human", icon: "soc", movable: true,
    flavor: "Runs the control room. Knows normal process behaviour cold."
  },
  {
    id: "proceng", name: "Process Engineer", short: "PE", rank: RANK.RESPONDER,
    count: 2, nature: "human", icon: "responder", movable: true,
    flavor: "Understands safe operating limits. Key to judging when a safe-state trip is justified."
  },
  {
    id: "autoeng", name: "Automation Engineer", short: "AE", rank: RANK.ENGINEER,
    count: 1, nature: "human", icon: "engineer", movable: true,
    flavor: "Builds and hardens the control logic and integrations."
  },
  {
    id: "mainttech", name: "Maintenance Tech", short: "MT", rank: RANK.SYSADMIN,
    count: 1, nature: "human", icon: "sysadmin", movable: true,
    flavor: "Keeps the plant running. Patches only in scarce maintenance windows (Stage 4)."
  },
  {
    id: "operator", name: "Plant Operator", short: "OP", rank: RANK.ANALYST,
    count: 2, nature: "human", icon: "analyst", movable: true,
    flavor: "Frontline eyes on the process. Numerous, but easily misled by spoofed readings."
  },
  {
    id: "historian", name: "Historian", short: "HIST", rank: RANK.INTEL,
    count: 1, nature: "system", icon: "intel", movable: true, special: "recon", customArt: true,
    flavor: "Logs process data. Fast to consult, but a soft target — can peek at an adjacent unrevealed piece."
  }
];

const OT_RED_PIECES = [
  {
    id: "sisattacker", name: "Safety-System Attacker", short: "TRITON", rank: RANK.FIREWALL + 1,
    count: 1, nature: "technical", icon: "exploit", movable: true, special: "firewall-killer",
    customArt: true,
    flavor: "The TRITON archetype. The only thing that defeats the Safety Instrumented System outright — the signature OT threat."
  },
  {
    id: "nationstate", name: "Nation-State OT Actor", short: "NS", rank: RANK.CISO,
    count: 1, nature: "human", icon: "apt", movable: true,
    flavor: "Patient, well-resourced, and specifically trained on industrial control systems."
  },
  {
    id: "rdpabuser", name: "Remote-Access Abuser", short: "RDP", rank: RANK.SOC_LEAD,
    count: 1, nature: "human", icon: "botmaster", movable: true, customArt: true,
    flavor: "Rides in on a compromised vendor / VPN account — one of the most common real OT vectors. Hard to distinguish from legitimate remote support."
  },
  {
    id: "plcmanip", name: "PLC Logic Manipulator", short: "PLCM", rank: RANK.RESPONDER,
    count: 2, nature: "technical", icon: "ransomware", movable: true, customArt: true,
    flavor: "Alters controller logic to drive the process out of bounds. Targets systems only — cannot engage humans."
  },
  {
    id: "pivot", name: "IT\u2192OT Pivot Actor", short: "PIVOT", rank: RANK.ENGINEER,
    count: 1, nature: "human", icon: "insider", movable: true, special: "disguise",
    flavor: "Crossed over from the IT network — the most common real path into OT. Blends in with routine traffic."
  },
  {
    id: "vendorimp", name: "Vendor Impersonator", short: "VND", rank: RANK.SYSADMIN,
    count: 1, nature: "human", icon: "socialeng", movable: true,
    flavor: "Poses as trusted maintenance or integration staff. Talks past people, not controls."
  },
  {
    id: "hmispoofer", name: "HMI Spoofer", short: "HMI", rank: RANK.ANALYST,
    count: 1, nature: "technical", icon: "phisher", movable: true, customArt: true,
    flavor: "Feeds operators false readings so they don't see the attack unfolding. Numerous. Targets systems."
  },
  {
    id: "otscanner", name: "OT Recon Scanner", short: "SCN", rank: RANK.INTEL,
    count: 2, nature: "technical", icon: "scanner", movable: true, special: "recon",
    flavor: "Maps the control network before the real attack. Fast and weak."
  }
];

// ----------------------------------------------------------------
// SCENARIO CARD LIBRARY
// Each card has:
//   side: 'blue' | 'red' | 'both'   which team may play it
//   type: 'move' | 'engage' | 'special'
//   difficulty: 1 (easy) - 5 (hard)  -> informs base success %
//   modifier: applied to the rank-vs-rank base odds in a clash
//   detectionRisk: how much playing this raises the Red detection meter
//   description: shown to players on the public board (flavor copy)
//   adminNotes: guidance for the admin when adjudicating
// ----------------------------------------------------------------
const IT_SCENARIO_CARDS = [
  // ---- RED (Attacker) scenario cards ----
  {
    id: "r_phish_campaign", side: "red", type: "engage", name: "Phishing Campaign",
    difficulty: 2, modifier: +5, detectionRisk: 10,
    description: "Send a crafted phishing wave to gain a foothold on the target segment.",
    adminNotes: "Base roll + modifier. Low detection cost if it fails quietly."
  },
  {
    id: "r_lateral_move", side: "red", type: "move", name: "Lateral Movement",
    difficulty: 2, modifier: 0, detectionRisk: 15,
    description: "Pivot from a compromised host to an adjacent segment.",
    adminNotes: "Standard move. Detection risk scales if Blue has Threat Intel nearby."
  },
  {
    id: "r_privesc", side: "red", type: "engage", name: "Privilege Escalation",
    difficulty: 3, modifier: +10, detectionRisk: 20,
    description: "Escalate access rights to overpower a stronger defender.",
    adminNotes: "Good vs equal/slightly-higher rank defenders. Noisy if it fails."
  },
  {
    id: "r_ddos", side: "red", type: "engage", name: "DDoS Smokescreen",
    difficulty: 1, modifier: -10, detectionRisk: 5,
    description: "Flood traffic to distract the SOC while another unit advances.",
    adminNotes: "Weak in direct combat but very low detection cost — use as a decoy play."
  },
  {
    id: "r_zeroday", side: "red", type: "engage", name: "Deploy Zero-Day",
    difficulty: 5, modifier: +30, detectionRisk: 35,
    description: "Burn a zero-day exploit. Devastating, but expensive and loud.",
    adminNotes: "Only the Exploit piece should realistically play this. High detection on success or fail."
  },
  {
    id: "r_socialeng", side: "red", type: "engage", name: "Social Engineering Pretext",
    difficulty: 2, modifier: +8, detectionRisk: 8,
    description: "Impersonate IT support to manipulate a staff member into compliance.",
    adminNotes: "Quiet if successful; only mild noise if it fails."
  },
  {
    id: "r_insider_access", side: "red", type: "special", name: "Insider Access",
    difficulty: 3, modifier: +15, detectionRisk: 5,
    description: "Use already-legitimate credentials to slip past a checkpoint unchallenged.",
    adminNotes: "Very low detection risk — this is the Insider Threat piece's signature play."
  },
  {
    id: "r_ransomware_deploy", side: "red", type: "engage", name: "Deploy Ransomware",
    difficulty: 4, modifier: +12, detectionRisk: 25,
    description: "Encrypt assets on the target node to force it offline.",
    adminNotes: "Strong but loud. Good finishing move once close to the Server."
  },
  {
    id: "r_recon_scan", side: "red", type: "special", name: "Recon Sweep",
    difficulty: 1, modifier: 0, detectionRisk: 3,
    description: "Passively probe an adjacent square to learn what's guarding it, without engaging.",
    adminNotes: "No combat. Admin privately tells the Red admin-side the rank tier (not identity) of the adjacent piece."
  },
  {
    id: "r_breach_server", side: "red", type: "engage", name: "Breach the Server",
    difficulty: 4, modifier: +15, detectionRisk: 40,
    description: "The final play — attempt to take down the Critical Server directly.",
    adminNotes: "Only valid when adjacent to the Server piece. Success with detection meter below threshold = RED WINS. Success with detection meter maxed = breach is caught in progress, BLUE WINS."
  },

  // ---- RED stealth / detection-reduction cards (Stage 1) ----
  {
    id: "r_clear_logs", side: "red", type: "special", name: "Clear Logs",
    difficulty: 3, modifier: 0, detectionRisk: -25,
    description: "Wipe event logs and artefacts to shrink your footprint. Buys stealth, but costs a full turn of progress.",
    adminNotes: "STEALTH: lowers the detection meter by 25. Uses the whole turn — Red makes no board move. This is the signature 'cool-off' play when detection is running hot."
  },
  {
    id: "r_low_and_slow", side: "red", type: "special", name: "Low & Slow (Dwell)",
    difficulty: 1, modifier: 0, detectionRisk: -10,
    description: "Sit quietly and blend into normal traffic. A small reduction in detection for ceding the initiative this turn.",
    adminNotes: "STEALTH: lowers the detection meter by 10. Red skips an aggressive move this turn — Blue effectively gets a free turn to reposition. Low risk, low reward."
  },
  {
    id: "r_living_off_land", side: "red", type: "special", name: "Living off the Land",
    difficulty: 4, modifier: 0, detectionRisk: 0,
    suppressNextDetection: true,
    description: "Use the target's own legitimate tools. Your NEXT aggressive action generates no detection at all.",
    adminNotes: "STEALTH (deferred): sets a flag so the next clash/engage this side plays adds ZERO detection. Consumed by the next action. Set up a turn ahead of a noisy push."
  },
  {
    id: "r_timestomp_blend", side: "red", type: "special", name: "Timestomp / Blend",
    difficulty: 3, modifier: 0, detectionRisk: 0,
    halveNextDetection: true,
    description: "Falsify timestamps and mimic routine activity, so your NEXT noisy action draws half the attention.",
    adminNotes: "STEALTH (deferred): sets a flag so the next clash/engage this side plays adds HALF its normal detection. Consumed by the next action. Weaker than Living off the Land, but easier to earn."
  },

  // ---- BLUE (Defender) scenario cards ----
  {
    id: "b_patch_harden", side: "blue", type: "engage", name: "Patch & Harden",
    difficulty: 2, modifier: +10, detectionRisk: 0,
    description: "Rapidly patch the targeted system and reinforce its defenses before contact.",
    adminNotes: "Good defensive boost when Blue suspects an imminent attack on this square."
  },
  {
    id: "b_threat_hunt", side: "blue", type: "special", name: "Threat Hunt",
    difficulty: 2, modifier: 0, detectionRisk: 0,
    description: "Proactively investigate a suspicious adjacent square.",
    adminNotes: "No combat. Admin privately reveals the rank tier of an adjacent unrevealed Red piece to the Blue admin-side."
  },
  {
    id: "b_isolate_segment", side: "blue", type: "engage", name: "Isolate Segment",
    difficulty: 3, modifier: +15, detectionRisk: 0,
    description: "Quarantine the network segment to cut off an advancing threat.",
    adminNotes: "Strong vs lateral movement plays. Effectively boosts the defending piece's odds."
  },
  {
    id: "b_incident_response", side: "blue", type: "engage", name: "Incident Response",
    difficulty: 3, modifier: +10, detectionRisk: 0,
    description: "Mobilize the IR team to actively repel the intrusion in progress.",
    adminNotes: "Use when defending a square under direct attack this turn."
  },
  {
    id: "b_deploy_honeypot", side: "blue", type: "special", name: "Bait the Trap",
    difficulty: 2, modifier: +20, detectionRisk: 0,
    description: "Activate a Honeypot's lure — any attacker engaging it is automatically identified.",
    adminNotes: "Only relevant when the Honeypot piece is the defender in the clash. Forces an attacker reveal regardless of outcome."
  },
  {
    id: "b_lockdown", side: "blue", type: "engage", name: "Emergency Lockdown",
    difficulty: 4, modifier: +20, detectionRisk: 0,
    description: "Hard lockdown of the segment — risky to operations, very effective defensively.",
    adminNotes: "Best emergency play when an attacker is one square from the Server."
  },
  {
    id: "b_raise_alert", side: "blue", type: "special", name: "Raise SOC Alert Level",
    difficulty: 1, modifier: 0, detectionRisk: 0,
    description: "Escalate the org-wide alert posture, raising the detection meter floor for this turn.",
    adminNotes: "No combat. Admin increases the detection meter by a flat amount (suggest +10)."
  },
  {
    id: "b_forensics", side: "blue", type: "special", name: "Digital Forensics",
    difficulty: 3, modifier: 0, detectionRisk: 0,
    description: "Examine a piece that was just involved in a clash to confirm its true identity.",
    adminNotes: "No combat. Use after any engagement — admin reveals the involved Red piece's identity publicly."
  },
  {
    id: "b_backup_restore", side: "blue", type: "special", name: "Backup & Restore",
    difficulty: 2, modifier: 0, detectionRisk: 0,
    description: "If a defending piece was just lost, restore a fallback unit to an adjacent friendly square.",
    adminNotes: "Use sparingly — recommend max once per game. Admin places a previously-eliminated low-rank Blue piece back on the board."
  },
  {
    id: "b_counter_intel", side: "blue", type: "engage", name: "Counter-Intelligence",
    difficulty: 3, modifier: +12, detectionRisk: 0,
    description: "Feed false information to confuse an advancing threat actor's targeting.",
    adminNotes: "Good vs Recon Scanner or Insider Threat plays specifically."
  }
];

// ================================================================
//  OT / ICS SCENARIO CARD LIBRARY (Stage 3)
//  OT-specific attack/defend cards + the four shared stealth cards
//  (which are domain-agnostic and reused verbatim from the IT set).
// ================================================================
const OT_SCENARIO_CARDS = [
  // ---- RED (OT attackers) ----
  {
    id: "ot_r_pivot", side: "red", type: "move", name: "Pivot from IT",
    difficulty: 2, modifier: +0, detectionRisk: 10,
    description: "Cross from the corporate IT network into the OT environment — the most common real path in.",
    adminNotes: "Movement play. Lets a Red piece advance across the DMZ toward the process network."
  },
  {
    id: "ot_r_manip_logic", side: "red", type: "engage", name: "Manipulate PLC Logic",
    difficulty: 4, modifier: +12, detectionRisk: 25, processRisk: 20,
    description: "Rewrite controller logic to push the process toward unsafe limits.",
    adminNotes: "ENGAGE. Strong vs system pieces (PLC, EWS). Cannot target humans — technical attack."
  },
  {
    id: "ot_r_spoof_hmi", side: "red", type: "engage", name: "Spoof HMI Readings",
    difficulty: 3, modifier: +10, detectionRisk: 15,
    description: "Feed operators false readings so the attack unfolds unseen on their screens.",
    adminNotes: "ENGAGE. Blinds Plant Operators to what's happening. Lowers the odds the play is spotted."
  },
  {
    id: "ot_r_remote_access", side: "red", type: "special", name: "Abuse Remote Access",
    difficulty: 3, modifier: +8, detectionRisk: 5,
    description: "Use a compromised vendor/VPN account to reach the OT network quietly.",
    adminNotes: "SPECIAL. Low detection — mimics legitimate remote support. Sets up a later engage."
  },
  {
    id: "ot_r_attack_sis", side: "red", type: "engage", name: "Attack the Safety System",
    difficulty: 5, modifier: +18, detectionRisk: 40, processRisk: 30,
    description: "Target the Safety Instrumented System itself — disable the last line of physical safety (the TRITON play).",
    adminNotes: "ENGAGE. Very noisy, very dangerous. Best played by the Safety-System Attacker against the SIS."
  },
  {
    id: "ot_r_commodity_malware", side: "red", type: "engage", name: "Commodity Malware",
    difficulty: 2, modifier: +5, detectionRisk: 30, processRisk: 10,
    description: "Unleash opportunistic malware that disrupts fragile OT hosts. Loud, but effective against soft systems.",
    adminNotes: "ENGAGE. Noisy. Good against Historian / EWS, weak against hardened SIS."
  },
  {
    id: "ot_r_manipulate_process", side: "red", type: "engage", name: "Drive Process Unsafe",
    difficulty: 5, modifier: +15, detectionRisk: 45, processRisk: 35,
    description: "The endgame — force the physical process past its safe operating limit.",
    adminNotes: "Only valid adjacent to the PLC/RTU. Success = RED objective. (Physical-damage/safe-state rules arrive in Stage 4.)"
  },

  // ---- RED shared stealth cards (reused from Stage 1, domain-agnostic) ----
  {
    id: "r_clear_logs", side: "red", type: "special", name: "Clear Logs",
    difficulty: 3, modifier: 0, detectionRisk: -25,
    description: "Wipe event logs and artefacts to shrink your footprint. Buys stealth, but costs a full turn of progress.",
    adminNotes: "STEALTH: lowers the detection meter by 25. Uses the whole turn — Red makes no board move."
  },
  {
    id: "r_low_and_slow", side: "red", type: "special", name: "Low & Slow (Dwell)",
    difficulty: 1, modifier: 0, detectionRisk: -10,
    description: "Sit quietly and blend into normal traffic. A small reduction in detection for ceding the initiative this turn.",
    adminNotes: "STEALTH: lowers the detection meter by 10. Red skips an aggressive move this turn."
  },
  {
    id: "r_living_off_land", side: "red", type: "special", name: "Living off the Land",
    difficulty: 4, modifier: 0, detectionRisk: 0, suppressNextDetection: true,
    description: "Use the target's own legitimate tools. Your NEXT aggressive action generates no detection at all.",
    adminNotes: "STEALTH (deferred): next clash/engage adds ZERO detection. Consumed by the next action."
  },
  {
    id: "r_timestomp_blend", side: "red", type: "special", name: "Timestomp / Blend",
    difficulty: 3, modifier: 0, detectionRisk: 0, halveNextDetection: true,
    description: "Falsify timestamps and mimic routine activity, so your NEXT noisy action draws half the attention.",
    adminNotes: "STEALTH (deferred): next clash/engage adds HALF its normal detection. Consumed by the next action."
  },

  // ---- BLUE (OT defenders) ----
  {
    id: "ot_b_segment_network", side: "blue", type: "engage", name: "Segment the OT Network",
    difficulty: 3, modifier: +12, detectionRisk: 0,
    description: "Enforce strict IT/OT separation and zone boundaries to contain the intruder.",
    adminNotes: "ENGAGE. Strong against Pivot and Remote-Access plays specifically."
  },
  {
    id: "ot_b_validate_logic", side: "blue", type: "engage", name: "Validate Controller Logic",
    difficulty: 4, modifier: +15, detectionRisk: 0,
    description: "Compare running PLC logic against the known-good baseline and restore it.",
    adminNotes: "ENGAGE. Directly counters PLC Logic Manipulator. Reverses unauthorised logic changes."
  },
  {
    id: "ot_b_verify_readings", side: "blue", type: "special", name: "Cross-Check Readings",
    difficulty: 2, modifier: +0, detectionRisk: 0,
    description: "Compare HMI values against independent field instruments to catch spoofing.",
    adminNotes: "SPECIAL. Counters HMI Spoofer — reveals when operators are being fed false data."
  },
  {
    id: "ot_b_maintenance_patch", side: "blue", type: "engage", name: "Maintenance-Window Patch",
    difficulty: 4, modifier: +10, detectionRisk: 0,
    description: "Use a scarce maintenance window to patch and harden a controller.",
    adminNotes: "ENGAGE. In Stage 4 this will require a maintenance-window token — for now it plays like Patch & Harden."
  },
  {
    id: "ot_b_safe_state", side: "blue", type: "special", name: "Prepare Safe-State Trip",
    difficulty: 3, modifier: +0, detectionRisk: 0,
    description: "Ready the Safety Instrumented System to halt the process to a guaranteed-safe state.",
    adminNotes: "SPECIAL. In Stage 4 this becomes the availability-vs-safety trip mechanic. For now it hardens the SIS."
  },
  {
    id: "ot_b_incident_response", side: "blue", type: "engage", name: "OT Incident Response",
    difficulty: 3, modifier: +12, detectionRisk: 0,
    description: "Mobilise the process engineers and control-room team against an active intrusion.",
    adminNotes: "ENGAGE. General-purpose defensive engage, strong with Process/Automation Engineers."
  },
  {
    id: "ot_b_threat_hunt", side: "blue", type: "special", name: "Hunt the OT Network",
    difficulty: 3, modifier: +0, detectionRisk: 0,
    description: "Proactively sweep the control network for signs of intrusion.",
    adminNotes: "SPECIAL. Raises the chance of catching a dwelling attacker. Pairs with the Historian."
  },
  {
    id: "ot_b_restore_backup", side: "blue", type: "special", name: "Restore Known-Good Config",
    difficulty: 4, modifier: +0, detectionRisk: 0,
    description: "Roll a compromised controller back to a verified safe configuration.",
    adminNotes: "SPECIAL. Recovery play after a logic-manipulation compromise."
  }
];

// ----------------------------------------------------------------
// BOARD CONSTANTS
// ----------------------------------------------------------------
const BOARD_SIZE = 6;

// Row indices (0 = Red's back row .. 5 = Blue's back row)
// Single DMZ row (row 2) separates the teams: Red gets 2 rows (12 cells),
// Blue gets 3 rows (18 cells) — the asymmetry is unavoidable on an even
// (6-row) board with exactly one neutral row; rosters are sized accordingly.
const BLUE_SETUP_ROWS = [3, 4, 5];   // Blue deploys in these rows
const RED_SETUP_ROWS  = [0, 1];      // Red deploys in these rows
const NEUTRAL_ROWS    = [2];         // No-man's land / single DMZ line

// Detection meter: when it reaches DETECTION_MAX, SOC catches the
// intrusion in progress -> Blue wins immediately regardless of position.
const DETECTION_MAX = 100;

// OT mode (Stage 4): process-safety meter. When it reaches PROCESS_MAX and Blue
// has NOT tripped to a safe state, the process is physically damaged -> worst-case
// Red win. Blue can cap this by invoking the Safe-State Trip (at the cost of availability).
const PROCESS_MAX = 100;

// =====================================================================
//  GAME PACKS (Stage 2)
//  A game pack bundles all the swappable content + settings for one mode.
//  The engine, board, and admin read the ACTIVE pack's content through the
//  backward-compatible globals below (ACTIVE_BLUE_PIECES etc.), which are
//  re-pointed by setActivePack(mode). Adding OT later = adding a pack here.
// =====================================================================
// Working globals — these are what the engine/board/admin read. setActivePack()
// re-points them to the active mode's arrays. They start on the IT pack.
let BLUE_PIECES = IT_BLUE_PIECES;
let RED_PIECES = IT_RED_PIECES;
let SCENARIO_CARDS = IT_SCENARIO_CARDS;

const GAME_PACKS = {
  it: {
    id: "it",
    label: "IT MODE",
    name: "Information Technology",
    tagline: "Enterprise Defense vs Advanced Persistent Threat",
    bluePieces: IT_BLUE_PIECES,
    redPieces: IT_RED_PIECES,
    cards: IT_SCENARIO_CARDS,
    // Primary meter shown on the board
    meter: { key: "detectionMeter", label: "SOC DETECTION", max: DETECTION_MAX, caughtLabel: "100% = caught" },
    // Mode-specific copy
    blueName: "DEFENDERS — BLUE",
    redName: "THREAT ACTORS — RED",
    objectiveName: "Critical Server"
  },
  ot: {
    id: "ot",
    label: "OT MODE",
    name: "Operational Technology",
    tagline: "Industrial Control System Defense vs OT Threat Actors",
    bluePieces: OT_BLUE_PIECES,
    redPieces: OT_RED_PIECES,
    cards: OT_SCENARIO_CARDS,
    meter: { key: "detectionMeter", label: "OT DETECTION", max: DETECTION_MAX, caughtLabel: "100% = caught" },
    blueName: "PLANT DEFENDERS — BLUE",
    redName: "OT THREAT ACTORS — RED",
    objectiveName: "PLC / RTU"
  }
};

const DEFAULT_MODE = "it";

// Active-pack pointers. These start as the IT pack and are re-pointed by
// setActivePack(). Existing code references these names, so nothing else
// needs to change when a new pack is selected.
let ACTIVE_MODE = DEFAULT_MODE;
let ACTIVE_PACK = GAME_PACKS[DEFAULT_MODE];

/**
 * Select which game pack is active. Called once when a game's mode is known
 * (at New Game, and whenever a client loads a game whose state.mode is set).
 * Falls back to the default pack if an unknown mode is passed.
 */
function setActivePack(mode) {
  const pack = GAME_PACKS[mode] || GAME_PACKS[DEFAULT_MODE];
  ACTIVE_MODE = pack.id;
  ACTIVE_PACK = pack;
  // Re-point the working globals so every consumer (engine, board, admin)
  // reads the active pack's roster and cards with no call-site changes.
  // These are module-level `let` bindings shared across all script files, so
  // the engine's SCENARIO_CARDS.find(...) etc. see the new values at call time.
  BLUE_PIECES = pack.bluePieces;
  RED_PIECES = pack.redPieces;
  SCENARIO_CARDS = pack.cards;
  return pack;
}

function getActivePack() { return ACTIVE_PACK; }
function getPack(mode) { return GAME_PACKS[mode] || GAME_PACKS[DEFAULT_MODE]; }

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    RANK, BLUE_PIECES, RED_PIECES, SCENARIO_CARDS,
    IT_BLUE_PIECES, IT_RED_PIECES, IT_SCENARIO_CARDS,
    OT_BLUE_PIECES, OT_RED_PIECES, OT_SCENARIO_CARDS,
    BOARD_SIZE, BLUE_SETUP_ROWS, RED_SETUP_ROWS, NEUTRAL_ROWS, DETECTION_MAX, PROCESS_MAX,
    GAME_PACKS, DEFAULT_MODE, setActivePack, getActivePack, getPack
  };
}
