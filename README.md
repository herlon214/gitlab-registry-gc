# Gitlab Registry Garbage Collector
Exclude old image tags registered in the Gitlab Registry.

The default `CONFIG_FILE` path set in the Docker image is `/var/grgc/config.yaml`.

### Usage
```
$ docker run -v yourconfigpath.yaml:/var/grgc/config.yaml herlon214/gitlab-registry-gc:latest

> gitlab-registry-gc@1.0.0 start /app
> DEBUG=grgc node src/index.js

grgc Getting token...
grgc Authenticating as herlon214...
grgc Authenticated successfully!
grgc Waiting for check period...
grgc Found 3 images for [yourworkspace/projectA] +19s
grgc Found 3 images for [yourworkspace/projectB] +235ms
grgc Found 8 images for [yourworkspace/projectC], 3 higher than the limit +902ms
grgc Deleting old image tags... +0ms
grgc [DELETED] /yourworkspace/projectC/registry/repository/76039/tags/master.98b3d8d +911ms
grgc [DELETED] /yourworkspace/projectC/registry/repository/76039/tags/master.9433102 +1ms
grgc [DELETED] /yourworkspace/projectC/registry/repository/76039/tags/master.846f0f5 +21ms
grgc 3 image tags deleted for [yourworkspace/projectC] +0ms
```

### Configuration file
Example of `config.yaml`, setup:
```yaml
# This is not available in the Gitlab api, so we need to
# login using your username and password
username: youruser
password: yourpass

garbage:
  max_parallel_delete: 5 # Max requests to be executed while deleting in parallel
  max_entries: 5 # Max image tags you want to keep
  check_period: "* * * * *" # Cron job format for period check
  order: DESC # Order to keep tags, e.g: DESC will keep the recently created
  exclude: # If you want to prevent some tag to be deleted
    - master
    - develop
    - latest

projects: # You need at least developer permission in each project
  - https://gitlab.com/yourworkspace/projectA
  - https://gitlab.com/yourworkspace/projectB
  - https://gitlab.com/yourworkspace/projectC
```