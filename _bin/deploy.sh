#!/bin/bash
source .env
rsync -av --progress --exclude=.git --exclude=_bin . ${DEST} 
