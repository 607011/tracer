.PHONY: all clean

CFLAGS=-O3
EMCCFLAGS=--no-entry -sEXPORTED_FUNCTIONS='["_n", "_init_genrand", "_init_by_array", "_genrand_int32", "_genrand_int31", "_genrand_range", "_genrand_real"]'
SRC=mt19937.c

all: mt.wasm

mt.wasm: $(SRC) Makefile
	emcc $(SRC) $(EMCCFLAGS) $(CFLAGS) -o mt.wasm

clean:
	rm -f mt.wasm mt.js
