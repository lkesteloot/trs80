
DST=../docs/favicon.ico

$(DST): favicon.ppm
	convert favicon.ppm $(DST)

favicon.ppm: favicon.txt txt2ppm.py
	python txt2ppm.py < favicon.txt > favicon.ppm
