# Releasing Atlas

To cut a release: write the CHANGELOG section, merge it to `main` in both repos, then push a `vX.Y.Z` tag to the public repo. The workflow does the rest. The numbered steps below are the same thing in detail.

Releases come from the public repo `Fazorath/atlas-dashboard`; the workflow
`.github/workflows/release.yml` is identical in both repos and only publishes there.

1. Move the `## [Unreleased]` notes in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` heading (Keep a Changelog), leaving an empty Unreleased section.
2. Merge to `main` in both repos so they match.
3. Tag the public repo: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The workflow builds `atlas-api`, `atlas-web` and `atlas-cron` for linux/amd64 + linux/arm64, pushes them to `ghcr.io/fazorath/` tagged `X.Y.Z` and `X.Y`, then creates the GitHub Release. Its notes are the `CHANGELOG.md` section for the tag; a tag with no section fails the job. `release/docker-compose.yml` and `install.sh` (stamped with the tag) are attached.
5. First release only: make the three GHCR packages public (package settings, Change visibility) so anonymous `docker pull` works.

Check the extraction by hand: `python3 .github/scripts/changelog_section.py CHANGELOG.md X.Y.Z`.
`WITH_VISION` images are not published; that build stays source-only.

## After the tag

- Check the Release page: notes match the CHANGELOG section, and `install.sh` and `docker-compose.yml` are attached.
- Run the installer one-liner on a clean machine with Docker; Atlas should answer and print a setup code.
- To ship a fix, bump the patch version (`X.Y.Z+1`) with its own CHANGELOG section. Don't move or re-push a tag that has been published.
