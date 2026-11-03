/* Where the setup code is, for the screens that ask for it (ADR 0008).
   Pure text, so node --test can cover it. */

export const CODE_COMMAND = "docker compose logs atlas-api | grep 'setup code'";

export const CODE_HELP = {
  intro:
    "Atlas prints a one-time setup code in its log when it starts with no Owner. To read it, open a terminal on the machine running Atlas, go to the install folder, and run:",
  folder:
    "The install folder is the one with docker-compose.yml in it: the folder the installer set up, or the folder you cloned Atlas into.",
} as const;
