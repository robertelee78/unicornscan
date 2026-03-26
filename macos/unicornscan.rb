# Homebrew formula for unicornscan
# Asynchronous stateless TCP/UDP network scanner with Alicorn web UI
#
# Usage:
#   brew install unicornscan
#   brew install unicornscan --with-postgresql@16   (enable DB output module)
#
# After install, enable non-root packet capture:
#   sudo $(brew --prefix)/share/unicornscan/macos/install-chmodbpf.sh
#
# For the Alicorn web UI (requires Docker):
#   unicornscan-alicorn start
#   open http://localhost:31337

class Unicornscan < Formula
  desc "Asynchronous stateless TCP/UDP network scanner with web UI"
  homepage "https://github.com/robertelee78/unicornscan"
  url "https://github.com/robertelee78/unicornscan/archive/refs/tags/v0.4.52.tar.gz"
  sha256 "ebbd92553d88e79b7a8df8deac24b210985cf067768cb5a9bf27ad12eb4061c0"
  license "GPL-2.0-or-later"
  head "https://github.com/robertelee78/unicornscan.git", branch: "main"

  # Prevent Homebrew from stripping .la files in the modules directory.
  # unicornscan's module loader (SHLIB_EXT=".la") uses .la files to discover
  # loadable modules. Without them, -epgsqldb, -eosdetect, and all payload
  # modules silently fail to load.
  skip_clean "lib/unicornscan/modules"

  depends_on "autoconf" => :build
  depends_on "automake" => :build
  depends_on "bison" => :build
  depends_on "flex" => :build
  depends_on "libtool" => :build
  depends_on "pkg-config" => :build
  depends_on "libdnet"
  depends_on "libpcap"
  depends_on :macos
  depends_on "postgresql@16" => :recommended
  depends_on "libmaxminddb" => :recommended

  def install
    # Run autoreconf to regenerate the build system from configure.ac.
    # The source tarball ships autotools inputs but not the generated
    # configure script, so this step is mandatory.
    system "autoreconf", "-fiv"

    args = %W[
      --prefix=#{prefix}
      --libdir=#{lib}
      --sysconfdir=#{etc}
      --localstatedir=#{var}
      --with-listen-user=nobody
    ]

    # Enable PostgreSQL output module when the dependency is present.
    # This builds src/output_modules/database/pgsqldb.la, which lets
    # users run `unicornscan -epgsqldb <target>` to store results in
    # PostgreSQL (used by the Alicorn web UI).
    if build.with? "postgresql@16"
      args << "--with-pgsql=#{Formula["postgresql@16"].opt_prefix}"
    end

    system "./configure", *args
    system "make", "-j#{ENV.make_jobs}"

    # Use DESTDIR-based staged install.  The Makefiles install into
    # DESTDIR-prefixed paths, so we point DESTDIR at a staging area
    # and then selectively copy files into the Homebrew prefix.
    #
    # IMPORTANT: Ruby Pathname#/ with an absolute RHS ignores the LHS,
    # so staging/prefix resolves to just prefix (wrong).  We use string
    # concatenation to build the correct DESTDIR-prefixed path.
    staging = buildpath/"stage"
    system "make", "install", "DESTDIR=#{staging}"
    staged = Pathname.new("#{staging}#{prefix}")

    # --- Binaries ---
    # Main scanner binary and its symlink
    bin.install staged/"bin/unicornscan"
    bin.install_symlink bin/"unicornscan" => "us"

    # Helper tools
    bin.install staged/"bin/fantaip"
    bin.install staged/"bin/unibrow"
    bin.install staged/"bin/unicfgtst"

    # GeoIP database update script (installed by top-level Makefile)
    bin.install staged/"bin/unicornscan-geoip-update"

    # Alicorn web UI management script
    bin.install "debian/unicornscan-alicorn"
    chmod 0755, bin/"unicornscan-alicorn"

    # --- Internal executables (sender and listener) ---
    # These are child processes spawned by the main binary; they live
    # in libexec rather than bin because users never invoke them directly.
    (libexec/"unicornscan").install staged/"libexec/unicornscan/unisend"
    (libexec/"unicornscan").install staged/"libexec/unicornscan/unilisten"

    # --- Loadable modules ---
    # Payload modules (.la + .so/.dylib) built by src/payload_modules
    # Output modules (e.g. pgsqldb) built by src/output_modules/database
    # Report modules (osdetect) built by src/report_modules/osdetect
    #
    # The staged MODDIR is lib/unicornscan/modules.  Copy the entire
    # directory preserving the .la and shared-object files that libtool
    # installed there.
    modules_staged = staged/"lib/unicornscan/modules"
    if modules_staged.exist?
      (lib/"unicornscan/modules").install Dir[modules_staged/"*"]
    end

    # NOTE: Do NOT remove .la files from the modules directory.
    # unicornscan's module loader (src/unilib/modules.c) uses SHLIB_EXT=".la"
    # to discover loadable modules. Without .la files, no modules load and
    # features like -epgsqldb, -eosdetect, and payload modules are silently
    # disabled. This overrides the normal Homebrew convention of removing .la.

    # --- Configuration files ---
    # Install config files to etc/unicornscan/.  Homebrew marks files
    # under etc/ as "configuration" so they survive upgrades.
    (etc/"unicornscan").install Pathname.new("#{staging}#{etc}")/"unicornscan/unicorn.conf"
    (etc/"unicornscan").install Pathname.new("#{staging}#{etc}")/"unicornscan/payloads.conf"
    (etc/"unicornscan").install Pathname.new("#{staging}#{etc}")/"unicornscan/oui.txt"
    (etc/"unicornscan").install Pathname.new("#{staging}#{etc}")/"unicornscan/ports.txt"
    (etc/"unicornscan").install Pathname.new("#{staging}#{etc}")/"unicornscan/modules.conf"

    # --- Man pages ---
    man1.install staged/"share/man/man1/unicornscan.1"
    man1.install staged/"share/man/man1/fantaip.1"
    man1.install staged/"share/man/man1/unibrow.1"
    man1.install staged/"share/man/man1/unicfgtst.1"
    man5.install staged/"share/man/man5/unicorn.conf.5"

    # --- macOS-specific files ---
    # Sandbox profile for the listener process.  The configure.ac
    # SANDBOX_PROFILE macro points to datadir/unicornscan/ at runtime.
    (share/"unicornscan").install "macos/unicornscan-listener.sb"
    (share/"unicornscan").install "macos/unicornscan-sender.sb"

    # ChmodBPF LaunchDaemon files -- users run install-chmodbpf.sh
    # manually after brew install (requires sudo).
    (share/"unicornscan/macos").install "macos/ChmodBPF"
    (share/"unicornscan/macos").install "macos/org.unicornscan.ChmodBPF.plist"
    (share/"unicornscan/macos").install "macos/install-chmodbpf.sh"
    (share/"unicornscan/macos").install "macos/uninstall-chmodbpf.sh"
    chmod 0755, share/"unicornscan/macos/ChmodBPF"
    chmod 0755, share/"unicornscan/macos/install-chmodbpf.sh"
    chmod 0755, share/"unicornscan/macos/uninstall-chmodbpf.sh"

    # --- Alicorn Web UI source tree ---
    # Installed to share/unicornscan/alicorn/ so the unicornscan-alicorn
    # management script and Docker Compose can find everything.  We do
    # NOT run npm install or Docker during the brew install; those happen
    # at runtime when the user runs `unicornscan-alicorn start`.
    alicorn_dest = share/"unicornscan/alicorn"

    # Docker configuration -- use the standalone compose that bundles
    # everything (no external dependencies beyond Docker itself).
    (alicorn_dest).install "alicorn/docker-compose.standalone.yml" => "docker-compose.yml"
    (alicorn_dest).install "alicorn/Dockerfile"
    (alicorn_dest).install "alicorn/nginx.conf"

    # PostgreSQL with schema (uses COPY instead of volume mount for Colima compat)
    (alicorn_dest/"postgres").install "alicorn/postgres/Dockerfile"
    (alicorn_dest/"postgres").install "alicorn/postgres/pgsql_schema.sql"

    # PostgREST sub-service
    (alicorn_dest/"postgrest").install "alicorn/postgrest/Dockerfile"

    # GeoIP API sub-service
    (alicorn_dest/"geoip-api").install "alicorn/geoip-api/Dockerfile"
    (alicorn_dest/"geoip-api").install "alicorn/geoip-api/package.json"
    (alicorn_dest/"geoip-api").install "alicorn/geoip-api/server.js"

    # Build configuration (needed for `unicornscan-alicorn dev` / `build`)
    %w[
      package.json
      package-lock.json
      vite.config.ts
      tsconfig.json
      tsconfig.app.json
      tsconfig.node.json
      index.html
    ].each do |f|
      (alicorn_dest).install "alicorn/#{f}" if File.exist?("alicorn/#{f}")
    end

    # Optional config files
    %w[eslint.config.js vitest.config.ts .prettierrc].each do |f|
      (alicorn_dest).install "alicorn/#{f}" if File.exist?("alicorn/#{f}")
    end

    # Source code directories (React app, CLI wizard, public assets)
    cp_r "alicorn/src", alicorn_dest
    cp_r "alicorn/public", alicorn_dest
    (alicorn_dest/"cli").mkpath
    (alicorn_dest/"cli").install "alicorn/cli/setup.ts"

    # SQL schema (used by docker-init.sh during container startup)
    (alicorn_dest/"sql").mkpath
    (alicorn_dest/"sql").install "src/output_modules/database/sql/pgsql_schema.sql"
  end

  def post_install
    # Create runtime directories that the scanner and alicorn expect
    (var/"unicornscan").mkpath
    (var/"unicornscan/alicorn").mkpath
  end

  def caveats
    <<~EOS
      Packet capture on macOS requires BPF device access. To allow
      running unicornscan without sudo, install the ChmodBPF daemon:

        sudo #{opt_share}/unicornscan/macos/install-chmodbpf.sh

      Then log out and log back in for group membership to take effect.

      To start the Alicorn web UI, you need Docker:

        brew install docker docker-compose colima
        colima start

      Then launch Alicorn:

        unicornscan-alicorn start
        open http://localhost:31337

      Run a scan with database output:

        unicornscan -epgsqldb <target>

      To download free GeoIP databases (DB-IP Lite, no registration):

        sudo unicornscan-geoip-update
    EOS
  end

  test do
    # Verify the binary runs and prints version information.
    # unicornscan --version exits 0 and prints version to stdout.
    assert_match version.to_s, shell_output("#{bin}/unicornscan --version", 0)

    # Verify helper tools are present and executable
    assert_predicate bin/"fantaip", :executable?
    assert_predicate bin/"unibrow", :executable?
    assert_predicate bin/"unicfgtst", :executable?
    assert_predicate bin/"unicornscan-geoip-update", :executable?
    assert_predicate bin/"unicornscan-alicorn", :executable?

    # Verify internal executables are present
    assert_predicate libexec/"unicornscan/unisend", :executable?
    assert_predicate libexec/"unicornscan/unilisten", :executable?

    # Verify config files are installed
    assert_predicate etc/"unicornscan/unicorn.conf", :exist?
    assert_predicate etc/"unicornscan/modules.conf", :exist?

    # Verify sandbox profile is present
    assert_predicate share/"unicornscan/unicornscan-listener.sb", :exist?

    # Verify Alicorn docker-compose is present
    assert_predicate share/"unicornscan/alicorn/docker-compose.yml", :exist?

    # Verify ChmodBPF files are present
    assert_predicate share/"unicornscan/macos/install-chmodbpf.sh", :executable?
  end
end
