# Changelog

All notable changes to Atlas are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/). The section for a version becomes the
body of its GitHub Release, so a tag `vX.Y.Z` needs a `## [X.Y.Z] - date` section.

## [Unreleased]

## [0.1.0] - 2026-11-03

First public release: Atlas as an install you can run in one command.

### Added
- One-command installer, `install.sh`: makes an `atlas` folder with the release compose file, a generated `.env` and `config/`, starts Atlas from published images, and prints the address and setup code. Safe to run again; it keeps your secrets, `config/` and pinned version.
- Release images `atlas-api`, `atlas-web` and `atlas-cron` for linux/amd64 and linux/arm64 on GHCR, and a release `docker-compose.yml` that pulls them. A GitHub Release is created for each tag, with its notes taken from this file.
- Guided Setup in the browser: claim the install with a one-time setup code from the host log, pick an Owner passphrase, then set who you are, where you are, and which modules to switch on, each with a Test button. Setup shows how to get the setup code, and a running API logs a new one after an owner reset.
- Modules: Weather, Habits, Work, School (Canvas), Health (Google Health), Money (Securo) and Listening (Audiobookshelf), arranged on boards of widgets you can move and resize.
- Demo mode that fills every area with a made-up student's week, so you can look around before connecting anything.
- Manual, built from `docs/manual/`, with install, updating, backups and a page per module.
