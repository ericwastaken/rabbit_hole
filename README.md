# Rabbit Hole

Rabbit Hole is an open-source utility to monitor and cleanup RabbitMQ competing-consumer queues of certain "bad messages" that match a REGEX. It is designed to be lightweight and easy to use. The messages that are consumed by this utility are not processed at all, they are simply removed from the queue! (memory-holed).

This utility can be run natively using NodeJS or can be deployed inside a Docker container. 

The name Rabbit Hole is a play on words, as the utility is designed to "memory-hole" bad messages and remove them from the queue without further processing.

Note, this utility is useful in a [competing consumer model](https://www.enterpriseintegrationpatterns.com/patterns/messaging/CompetingConsumers.html), where multiple consumers are consuming messages from the same queue (and each message is given by the broker to a single consumer at a time). It is assumed that this utility is one of multiple consumers processing a queue (this utility performing cleanup, while other consumers are doing actual processing). 

Rabbit_hole can run continuously, but is best run in an interval mode, where it runs for a short period of time, cleans up the bad messages, and then stops until another future interval.

In pub/sub or topic exchange models, this utility may not be as useful since the same messages are delivered to multiple consumers.

## Motivation

I had a situation where a RabbitMQ server was getting junk messages from an upstream application and we could not immediately modify the existing processing code base to ignore the junk messages. The messages would fail processing and be requeued for a later consumer to handle. IN our case, the messages would never process and wold en dup clogging a queue with many messages that would eventually go to dead-letter (but only after many hours of wasted retries.) 

Rabbit Hole was created to connect to the server on a periodic basis and then remove the junk messages from certain queues, as a temporary measure.

## Installation & Use

### Prerequisites
- [Node.js](https://nodejs.org/) (version 20.10.0).
- [Docker](https://www.docker.com/) (Docker is the preferred method of running this tool for the best isolation from other dependencies.)
- Internet access to download dependencies during the NPM install or Docker build process.

### Create your environment and configuration files

1. Create an .env file in the secrets directory with the following content:
    ```text
    BROKER_URL=YOUR_BROKER_URL
    BROKER_USERNAME=YOUR_BROKER_USERNAME
    BROKER_PASSWORD=YOUR_BROKER_PASSWORD
    # For non-TLS broker
    BROKER_PROTOCOL=amqp
    BROKER_PORT=5672
    # For TLS broker uncomment these and comment out the above two lines
    #BROKER_PROTOCOL=amqps
    #BROKER_PORT=5671
    #BROKER_CA_CERT_PATH=./secrets/ca_certificate.pem
    ```
    Replace YOUR_BROKER_URL, YOUR_BROKER_USERNAME, and YOUR_BROKER_PASSWORD with your RabbitMQ server URL, username, and password.
    
    If you are connecting to a TLS-enabled RabbitMQ server, you will need to provide the path to the CA certificate file in the BROKER_CA_CERT_PATH variable. We recommend you copy it to the secrets directory and reference it from there.

    For your convenience, you can copy the template.env file in the secrets directory and rename it to .env.

2. Create a queue configuration file in the config directory. You can use the queue-conf-example.json5 file as a template.

   ```json5
    {
        default_regex: ".*drop.*",
        queue_list: [
            {
                "queue_name": "some-queue-name",
                "regex_to_drop": "drop-me"
            },
            {
                "queue_name": "some-other-queue-name",
                "regex_to_drop": "bad-stuff"
            }
        ]
    }
    ```
   You can have as many entries as you like in the queue_list array. Each entry should have a queue_name and a regex_to_drop. The default_regex is used if a queue does not have a regex_to_drop specified.

### Running natively on NodeJS on your workstation

1. Clone the repository:
    ```sh
    git clone https://github.com/ericwastaken/rabbit_hole.git
    cd rabbit_hole
    ```

2. Install dependencies:
    ```sh
    npm ci
    ```

3. Crete your environment and configuration files as described in the section [Create your environment and configuration files](#create-your-environment-and-configuration-files).

4. Run the utility:
    ```sh
    node src/index.mjs \
      --prefetch-size 1000 \
      --env-file ./secrets/.env \
      --queue-config ./config/queue-conf-example.json5 \
      --logDroppedMessages \
      --runMode=interval \
      --runSchedule * * * * * \
      --runDurationSeconds 5 \ 
      --v --v
    ```

    The above runs the utility in interval mode, checking the queues every minute for 5 seconds. The verbosity is set to 2, so you will see more output.

### Running via Docker

1. Clone the repository:
    ```sh
    git clone https://github.com/ericwastaken/rabbit_hole.git
    cd rabbit_hole
    ```

2. Crete your environment and configuration files as described in the section [Create your environment and configuration files](#create-your-environment-and-configuration-files).

3. Edit the docker-compose.yml file and edit the command to suit your specific needs. In particular, be sure to edit your runSchedule and runDurationSeconds as well as prefetch-size, if needed.

4. Run with Docker Compose:
    ```sh
    docker-compose up --build
    ```

### Command Line Arguments

The following command line arguments are supported:
- --prefetch-size (default 1000) - determines how many messages to prefetch from the queue. If you're messages are small, you can prefetch more messages to increase throughput. If you're messages are large, you may want to prefetch fewer messages.
- --env-file - path to the .env file that contains the broker connection information. See the section [Create your environment and configuration files](#create-your-environment-and-configuration-files) for more information.
- --queue-config - path to the queue configuration file. See the section [Create your environment and configuration files](#create-your-environment-and-configuration-files) for more information.
- --logDroppedMessages - if set, the utility will log the messages that are dropped.
- --logMessagePath (default ./dropped-messages) - path to a directory where the dropped messages will be written.
- --runMode (default continuous) - can be set to either "**continuous**" or "**interval**". In continuous mode, the utility will run until stopped. In interval mode, the utility will run for a specified duration and then stop. See the section [Interval Run Mode](#interval-run-mode) for more information about why this is useful.
- --v (which you can repeat up to 3 times to increase verbosity). For example, --v --v will set the verbosity to 2.

If running in interval mode, you will also need to provide the following arguments:
- --runSchedule - a CRON compatible string that determines when the utility will run. For example, * * * * * will run the utility every minute. The helpful site [Crontab Guru](https://crontab.guru) has a great tool to help you create your schedule. 
- --runDurationSeconds - the number of seconds the utility will run for each time it is triggered by the schedule.

## Interval Run Mode

**Background** 

The RabbitMQ broker will give a consumer messages so long as messages are unacknowledged. This utility ignores messages that don't match a REGEX, therefore leaving them in the Queue, unacknowledged (in fact, it specifically NACKS those and requeues them). So, if a queue has 100 messages that don't match the REGEX for rabbit_hole, rabbit_hole will ignore them (but does requeue them) and the broker will continue to hand those messages to rabbit_hole over and over again. For efficiency, rabbit_hole does look at the `redelivered` property in messages and doesn't bother to check the REGEX for any messages that are `redelivered`.

Also, in a standard competing consumer model, a broker will only assign a message to a single consumer at a time. Since the purpose of this utility is to "clean up" certain bad messages, it's presumably not the only consumer pointing to a queue. Some other consumer will be processing the good messages. 

For the above reasons, it's useful to run this utility in an interval mode. This way, the utility can run for a short period of time, clean up the bad messages, and then stop, allowing the other consumers to process the good messages without interference from this utility's consumer.

## License
This project is licensed under the MIT License. See the [LICENSE file](./LICENSE.md) for details.