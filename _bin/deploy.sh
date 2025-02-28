#!/bin/bash
source .env
rsync -av --progress --exclude=.* --exclude=_* . ${DEST} 
