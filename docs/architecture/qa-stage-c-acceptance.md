# Post-P10 QA personas Stage C — consolidated synthetic acceptance workbench

Parent issues #62 and #120. Extend the existing four-persona Stage A selector and 12 Stage B fictional walkthroughs, without adding user accounts, access grants, persistence or data movement.

Each simulated Owner, Association Admin, Club Admin or Manager / Coach context shows an expandable **QA acceptance checks** section. The seven deterministic checks per selected fictional context cover its three guided journeys, scope visibility, switching, forged-action refusal and physical Safari/VoiceOver review. Copying the checklist only produces plain text with **no pass result** and visible human evidence blanks.

Security boundaries: works only behind the existing trial/test-library QA gate. It uses pure synthetic definitions, not the actual workspace. It must not invoke GitHub publishing, import, account elevation, volunteer accreditation or private person data. Browser/Node tests enforce the boundary. This is not a backend tenant security test.

Owner physical-device acceptance remains open: record real device model, Safari/OS version, screenshots, VoiceOver focus, tested exact merged commit and observed pass/fail for all four persona scopes. Only after separate acceptance may #62's final milestone be marked complete; #55 production authentication remains deferred.
