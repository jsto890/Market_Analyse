#!/usr/bin/env zsh
# One-time setup: schedule a daily pre-wake so US-close jobs can run (master plan §2.4).
# REQUIRES SUDO — run manually by the user, never by an agent.
#
# Limitation: pmset supports ONE repeating wake event. 05:45 local covers the
# AEST period (15:45 ET ≈ 05:45 AEST next day). During AEDT (Oct–Apr) the US
# close lands ~07:50 local; jobs self-heal via backfill (EOD chains are
# re-fetchable), and heartbeat badges surface any missed night.
echo "Scheduling daily wake at 05:45 local (requires sudo)…"
sudo pmset repeat wakeorpoweron MTWRF 05:45:00
pmset -g sched
