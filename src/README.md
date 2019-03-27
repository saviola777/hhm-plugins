# /src

Each subdirectory contains associated plugins for an author or category.

* `hhm/`: This directory contains essential plugins for the HHM system. They
  will be loaded on HHM start before any user plugins and must be available
  in a least one of the configured repositories.
* `sav/`: A collection of my plugins, most of which are general purpose and can
  be used in any host. The most general useful and unobtrusive plugins are
  bundled in the meta plugin `sav/core`, which you can include to get all of
  these plugins in your host.

Please see the `README` files in each directory for more details on the
contained plugins. 