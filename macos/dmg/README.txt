Unicornscan for macOS
=====================

A fast network scanner with asynchronous stateless TCP/UDP probing
and advanced banner grabbing.


INSTALLATION
------------

1. Double-click "Install.pkg" in this disk image.
2. Follow the on-screen prompts (you will need an administrator password).
3. The installer will:
   - Place scanner binaries in /usr/local/bin/
   - Install modules to /usr/local/lib/unicornscan/modules/
   - Install configuration to /usr/local/etc/unicornscan/
   - Set up the ChmodBPF LaunchDaemon for non-root packet capture
   - Create the 'unicornscan' group and add your user to it
4. LOG OUT and log back in (or reboot) so the group membership takes
   effect.  Without this step, you will need to use sudo.


BPF DEVICE PERMISSIONS (ChmodBPF)
---------------------------------

The installer automatically configures a LaunchDaemon that sets
/dev/bpf* device permissions at every boot.  This allows members of
the 'unicornscan' group to capture packets without root privileges.

No manual configuration is needed.  If you want to add additional
users to the group:

    sudo dseditgroup -o edit -a USERNAME -t user unicornscan


ALICORN WEB UI
--------------

Alicorn is the web-based results dashboard for unicornscan.  If the
disk image contains an Alicorn.app, you can:

1. Drag Alicorn.app to your Applications folder.
2. Launch it from Applications or Spotlight.

Alicorn requires Docker Desktop to run its full stack (PostgreSQL,
PostgREST, GeoIP API).  See the Alicorn documentation for details.


RUNNING YOUR FIRST SCAN
------------------------

Open Terminal and run:

    # TCP SYN scan of ports 1-1024 on a target
    unicornscan -mT 192.168.1.1:1-1024

    # UDP scan
    unicornscan -mU 192.168.1.1:1-1024

    # Scan with increased rate (packets per second)
    unicornscan -mT -r 500 192.168.1.1:1-65535

    # Show help
    unicornscan -h

Note: If you have not yet logged out and back in after installation,
prefix commands with sudo:

    sudo unicornscan -mT 192.168.1.1:1-1024


UNINSTALLATION
--------------

To completely remove unicornscan:

    # 1. Unload and remove ChmodBPF
    sudo launchctl unload /Library/LaunchDaemons/org.unicornscan.ChmodBPF.plist
    sudo rm -f /Library/LaunchDaemons/org.unicornscan.ChmodBPF.plist
    sudo rm -f /usr/local/bin/ChmodBPF

    # 2. Remove binaries
    sudo rm -f /usr/local/bin/unicornscan /usr/local/bin/us
    sudo rm -f /usr/local/bin/fantaip
    sudo rm -f /usr/local/bin/unibrow
    sudo rm -f /usr/local/bin/unicfgtst
    sudo rm -f /usr/local/bin/unicornscan-geoip-update

    # 3. Remove libraries, config, and data
    sudo rm -rf /usr/local/lib/unicornscan
    sudo rm -rf /usr/local/etc/unicornscan
    sudo rm -rf /usr/local/libexec/unicornscan
    sudo rm -rf /usr/local/var/unicornscan
    sudo rm -rf /usr/local/share/unicornscan

    # 4. Remove sandbox profile
    sudo rm -f /usr/local/share/unicornscan/unicornscan-listener.sb

    # 5. Optionally remove the unicornscan group
    sudo dseditgroup -o delete unicornscan

    # 6. Remove Alicorn.app (if installed)
    rm -rf /Applications/Alicorn.app

    # 7. Remove log file
    sudo rm -f /var/log/unicornscan-chmodbpf.log


SUPPORT
-------

    https://github.com/robertelee78/unicornscan
    robert@unicornscan.org
