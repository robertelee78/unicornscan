Unicornscan for macOS
=====================

A fast network scanner with asynchronous stateless TCP/UDP probing
and advanced banner grabbing.


QUICK START
-----------

1. Double-click "Install.pkg" in this disk image.
2. Follow the on-screen prompts (administrator password required).
3. LOG OUT and log back in (or reboot) for BPF group membership
   to take effect.
4. Open Terminal and run:

       unicornscan -mT 192.168.1.1:1-1024

For full documentation, usage examples, and the Alicorn web UI
setup guide, visit:

    https://unicornscan.org/docs/getting-started


WHAT THE INSTALLER DOES
------------------------

- Places scanner binaries in /usr/local/bin/
- Installs modules to /usr/local/lib/unicornscan/modules/
- Installs configuration to /usr/local/etc/unicornscan/
- Sets up the ChmodBPF LaunchDaemon for non-root packet capture
- Creates the 'unicornscan' group and adds your user to it
- Downloads free GeoIP databases (DB-IP Lite, no registration)

To add other users to the BPF capture group:

    sudo dseditgroup -o edit -a USERNAME -t user unicornscan


UNINSTALLATION
--------------

See https://unicornscan.org/docs/getting-started#uninstall for
the full removal procedure, or run:

    sudo /usr/local/bin/uninstall-chmodbpf.sh
    sudo rm -f /usr/local/bin/unicornscan /usr/local/bin/us
    sudo rm -f /usr/local/bin/fantaip /usr/local/bin/unibrow
    sudo rm -f /usr/local/bin/unicfgtst /usr/local/bin/unicornscan-geoip-update
    sudo rm -rf /usr/local/lib/unicornscan /usr/local/etc/unicornscan
    sudo rm -rf /usr/local/libexec/unicornscan /usr/local/var/unicornscan
    sudo rm -rf /usr/local/share/unicornscan
    sudo dseditgroup -o delete unicornscan
    rm -rf /Applications/Alicorn.app


SUPPORT
-------

    Docs:    https://unicornscan.org/docs/getting-started
    Source:  https://github.com/robertelee78/unicornscan
    Email:   robert@unicornscan.org
