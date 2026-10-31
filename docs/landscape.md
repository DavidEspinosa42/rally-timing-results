# Landscape (October 2026)

How times travel from a rally stage to the results today, and where this app
fits. Rally terms are explained in [domain.md](domain.md).

| Product / practice                            | What it is                                                                                                            | Relationship to this project                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Paper time cards and marshal check sheets** | How most amateur rallies move times today                                                                             | **This is what we replace**: the path from the stage to the results, with tamper evidence                                                                    |
| RallySafe, Anubesport, Chronodium, ALGE       | GPS in the car, photocells, beams                                                                                     | Timing systems: their readings can be **entered** in the app; we do not compete with them                                                                    |
| Regional timing providers                     | Photocells with a printing clock at start and finish, and the "Cómputos" role that computes and publishes the results | **We feed them**: the app moves the times from each control to Cómputos, signed. The first integration target is a CSV export by car number for their system |
| RACE RESULT 14 + EventTools                   | Generic software; an app for manual entry by number, offline                                                          | The closest analog, but generic, closed source, with no per-record signature or public verification                                                          |
| Rally Checkpoint Clock (NASA Rallysport)      | An app that times                                                                                                     | A different purpose, abandoned since 2017                                                                                                                    |
| Rally Tripmeter, 3pRally                      | Apps for the crew                                                                                                     | Not for marshals                                                                                                                                             |

## Differentiation

An independent layer on top of any timing system. It is free and MIT, runs on
any phone with no install, works offline, and every record is signed by the
marshal's device, with public verification.
