FROM busybox:1.37

# Create a non-root user to own the files and run our server.
RUN adduser -D static
USER static
WORKDIR /home/static

# Copy the static website.
COPY dist/ .

# Run BusyBox httpd.
CMD [ "httpd", "-f", "-v"]

