
FAVICON=../docs/favicon.ico
DEMON=../docs/demon.png

$(DEMON): favicon.ppm Makefile
	convert favicon.ppm -scale 512x512 -transparent black -trim -strip $(DEMON)

$(FAVICON): favicon.ppm
	convert favicon.ppm $(FAVICON)

favicon.ppm: favicon.txt txt2ppm.py
	python txt2ppm.py < favicon.txt > favicon.ppm
