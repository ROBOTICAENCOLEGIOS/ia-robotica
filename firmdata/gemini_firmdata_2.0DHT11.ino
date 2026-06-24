// ==========================================
// FIRMWARE ROBOTICA EN COLEGIOS - V2.0 (Custom)
// Base: v1.7.1 (Con LEDs) + Fix Sensor Ultrasónico v1.8.8
// Driver: TB6612FNG | Freno activo y compensación
// Agregado: DHT11 en A5 con lectura de caché no bloqueante
// ==========================================
#include <Adafruit_NeoPixel.h>
#include <DHT.h>

// --- DEFINICIÓN DE PINES ---
#define PIN_TRIG 2
#define PIN_ECHO 12
#define PIN_IR 3
#define PIN_BUZZER 11
#define PIN_LED1 13
#define PIN_LED2 4

#define MOTOR_DER_IN1 8
#define MOTOR_DER_IN2 9
#define MOTOR_DER_PWM 10 

#define MOTOR_IZQ_IN1 6
#define MOTOR_IZQ_IN2 7
#define MOTOR_IZQ_PWM 5  

// --- CONFIGURACIÓN DEL SENSOR DHT ---
#define DHTPIN A5      // Pin analógico A5 usado como digital
#define DHTTYPE DHT11  // Tipo de sensor
DHT dht(DHTPIN, DHTTYPE);

// --- VARIABLES PARA LECTURA NO BLOQUEANTE DEL DHT ---
unsigned long tiempoUltimaLecturaDHT = 0;
float tempGuardada = 0.0;
float humGuardada = 0.0;
bool errorDHT = true;

Adafruit_NeoPixel pixel1(1, PIN_LED1, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel pixel2(1, PIN_LED2, NEO_GRB + NEO_KHZ800);

void setup() {
  Serial.begin(115200);
  
  pinMode(MOTOR_DER_IN1, OUTPUT);
  pinMode(MOTOR_DER_IN2, OUTPUT);
  pinMode(MOTOR_DER_PWM, OUTPUT);
  
  pinMode(MOTOR_IZQ_IN1, OUTPUT);
  pinMode(MOTOR_IZQ_IN2, OUTPUT);
  pinMode(MOTOR_IZQ_PWM, OUTPUT);

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_IR, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  pixel1.begin();
  pixel2.begin();
  dht.begin(); // Inicializar el sensor DHT
  
  detenerMotores();
}

void loop() {
  if (Serial.available() > 0) {
    String comando = Serial.readStringUntil('\n');
    comando.trim();
    
    if (comando.startsWith("AT+M_IZQ=")) {
      int vel = comando.substring(9).toInt();
      moverMotorIzquierdo(vel);
    } 
    else if (comando.startsWith("AT+M_DER=")) {
      int vel = comando.substring(9).toInt();
      moverMotorDerecho(vel);
    } 
    else if (comando == "AT+MOTOR=STOP" || comando == "AT+STOP_ALL") {
      detenerMotores();
    } 
    else if (comando == "AT+DISTANCIA") {
      long dist = medirDistancia();
      Serial.println(dist);
    } 
    else if (comando == "AT+IR") {
      int estado = digitalRead(PIN_IR);
      Serial.println(estado == LOW ? "1" : "0");
    } 
    
    // --- LECTURA NO BLOQUEANTE DEL DHT11 ---
    else if (comando == "AT+DHT") {
      unsigned long tiempoActual = millis();
      
      // Solo lee el sensor físico si pasaron 2000 ms (2s) o es la primera vez
      if (tiempoActual - tiempoUltimaLecturaDHT >= 2000 || tiempoUltimaLecturaDHT == 0) {
        float h = dht.readHumidity();
        float t = dht.readTemperature();
        
        if (isnan(h) || isnan(t)) {
          errorDHT = true;
        } else {
          errorDHT = false;
          humGuardada = h;
          tempGuardada = t;
        }
        tiempoUltimaLecturaDHT = tiempoActual;
      }
      
      // Responde a TurboWarp INMEDIATAMENTE con el valor guardado
      if (errorDHT) {
        Serial.println("0,0");
      } else {
        Serial.print(humGuardada);
        Serial.print(",");
        Serial.println(tempGuardada);
      }
    }
    // ---------------------------------------
    
    else if (comando.startsWith("AT+LED1=")) {
      aplicarColorRGB(pixel1, comando.substring(8));
    } 
    else if (comando.startsWith("AT+LED2=")) {
      aplicarColorRGB(pixel2, comando.substring(8));
    } 
    else if (comando.startsWith("AT+NOTE=")) {
      int coma = comando.indexOf(',');
      int frec = comando.substring(8, coma).toInt();
      int dur = comando.substring(coma + 1).toInt();
      tone(PIN_BUZZER, frec, dur);
    }
  }
}

// --- FUNCIONES DE MOTORES ---

void moverMotorIzquierdo(int velocidad) {
  velocidad = constrain(velocidad, -255, 255);
  if (velocidad > 0) {
    digitalWrite(MOTOR_IZQ_IN1, HIGH);
    digitalWrite(MOTOR_IZQ_IN2, LOW);
    analogWrite(MOTOR_IZQ_PWM, velocidad);
  } else if (velocidad < 0) {
    digitalWrite(MOTOR_IZQ_IN1, LOW);
    digitalWrite(MOTOR_IZQ_IN2, HIGH);
    analogWrite(MOTOR_IZQ_PWM, abs(velocidad));
  } else {
    // FRENO ACTIVO: IN1=L, IN2=L y PWM en 255 bloquea el motor
    digitalWrite(MOTOR_IZQ_IN1, LOW);
    digitalWrite(MOTOR_IZQ_IN2, LOW);
    analogWrite(MOTOR_IZQ_PWM, 255); 
  }
}

void moverMotorDerecho(int velocidad) {
  velocidad = constrain(velocidad, -255, 255);
  // Pequeña compensación para igualar la fuerza del motor derecho
  int v_final = velocidad;
  if (v_final != 0) {
      v_final = (v_final > 0) ? v_final + 12 : v_final - 12;
  }
  v_final = constrain(v_final, -255, 255);
  
  if (v_final > 0) {
    digitalWrite(MOTOR_DER_IN1, HIGH);
    digitalWrite(MOTOR_DER_IN2, LOW);
    analogWrite(MOTOR_DER_PWM, v_final);
  } else if (v_final < 0) {
    digitalWrite(MOTOR_DER_IN1, LOW);
    digitalWrite(MOTOR_DER_IN2, HIGH);
    analogWrite(MOTOR_DER_PWM, abs(v_final));
  } else {
    // FRENO ACTIVO: IN1=L, IN2=L y PWM en 255 bloquea el motor
    digitalWrite(MOTOR_DER_IN1, LOW);
    digitalWrite(MOTOR_DER_IN2, LOW);
    analogWrite(MOTOR_DER_PWM, 255);
  }
}

void detenerMotores() {
  moverMotorIzquierdo(0);
  moverMotorDerecho(0);
  noTone(PIN_BUZZER);
}

// --- AUXILIARES ---

void aplicarColorRGB(Adafruit_NeoPixel &pixel, String rgbString) {
  int primerComa = rgbString.indexOf(',');
  int segundaComa = rgbString.indexOf(',', primerComa + 1);
  if (primerComa > 0 && segundaComa > 0) {
    int r = rgbString.substring(0, primerComa).toInt();
    int g = rgbString.substring(primerComa + 1, segundaComa).toInt();
    int b = rgbString.substring(segundaComa + 1).toInt();
    pixel.setPixelColor(0, pixel.Color(r, g, b));
    pixel.show();
  }
}

long medirDistancia() {
  digitalWrite(PIN_TRIG, LOW); 
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH); 
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  
  // Timeout ajustado a 30000ms para evitar loops fantasma
  long duracion = pulseIn(PIN_ECHO, HIGH, 30000);
  if (duracion == 0) return 999;
  return duracion / 58;
}